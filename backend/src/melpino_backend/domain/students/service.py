from __future__ import annotations

# Student dedup/lookup -- see docs/design/03-database.md: dedup on
# (lower(email), lower(full_name)) at booking time, match -> reuse row,
# else create. No DOB/SSN/license numbers, ever.
import logging
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from typani.result import Err, Ok, Result

from melpino_backend.db.models.students import Student
from melpino_backend.errors import StudentError

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def find_or_create_student(
    db: "AsyncSession", *, full_name: str, email: str, phone: str = ""
) -> "Student":
    """Reuses an existing row matched on (lower(email), lower(full_name)),
    else creates one."""
    stmt = select(Student).where(
        func.lower(Student.email) == email.strip().lower(),
        func.lower(Student.full_name) == full_name.strip().lower(),
    )
    existing = (await db.execute(stmt)).scalars().first()
    if existing is not None:
        logger.info("student dedup hit: reusing student_id=%s", existing.id)
        # Keep the most recent phone the booker supplied -- a household
        # member may book again with a corrected/new number.
        if phone and existing.phone != phone:
            existing.phone = phone
        return existing

    # The SELECT above can miss a concurrent insert of the SAME new
    # person (different session, no shared row lock -- see FINDINGS.md
    # L2). The uq_students_lower_email_lower_full_name unique index is
    # the backstop; a SAVEPOINT keeps a loser's IntegrityError from
    # poisoning the caller's transaction, and we re-select the winner's
    # row instead of erroring out.
    try:
        async with db.begin_nested():
            student = Student(
                full_name=full_name.strip(), email=email.strip(), phone=phone
            )
            db.add(student)
            await db.flush()
    except IntegrityError:
        logger.info(
            "student dedup race: concurrent insert won, re-selecting for email=%s",
            email.strip().lower(),
        )
        winner = (await db.execute(stmt)).scalars().first()
        if winner is None:  # pragma: no cover - defensive, should be unreachable
            raise
        # Keep the most recent phone the booker supplied, same as the
        # non-racing path above -- otherwise the loser's freshly-supplied
        # phone is silently dropped (see FINDINGS.md L3).
        if phone and winner.phone != phone:
            winner.phone = phone
        return winner

    logger.info("student dedup miss: created student_id=%s", student.id)
    return student


async def get_student(
    db: "AsyncSession", student_id: UUID
) -> Result["Student", StudentError]:
    """Admin roster lookup."""
    student = await db.get(Student, student_id)
    if student is None:
        logger.info("student lookup failed: student_id=%s", student_id)
        return Err(StudentError.NotFound)
    return Ok(student)
