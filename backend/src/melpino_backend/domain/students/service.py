from __future__ import annotations

# Student dedup/lookup -- see docs/design/03-database.md: dedup on
# (lower(email), lower(full_name)) at booking time, match -> reuse row,
# else create. No DOB/SSN/license numbers, ever.
from typing import TYPE_CHECKING
from uuid import UUID

from typani.result import Result

from melpino_backend.errors import StudentError

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from melpino_backend.db.models.students import Student


async def find_or_create_student(
    db: "AsyncSession", *, full_name: str, email: str, phone: str = ""
) -> "Student":
    """Reuses an existing row matched on (lower(email), lower(full_name)),
    else creates one."""
    raise NotImplementedError("see docs/design/03-database.md")  # TODO(impl)


async def get_student(
    db: "AsyncSession", student_id: UUID
) -> Result["Student", StudentError]:
    """Admin roster lookup."""
    raise NotImplementedError("see docs/design/03-database.md")  # TODO(impl)
