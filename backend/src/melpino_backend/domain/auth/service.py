from __future__ import annotations

# Admin login/logout/admin-seed domain logic -- see
# docs/design/02-auth-and-security.md. CRIB: logand.app
# backend/src/logand_backend/domain/auth/service.py's login/logout shape,
# adapted to melpino's admin-only (no self-registration) surface and to
# db/models/users.py::User's documented columns (id, email, password_hash,
# role, disabled_at) -- those columns do not exist yet as of this writing
# (User is still `__abstract__`, see that file's own TODO), so this module
# is written against the documented interface and will raise a real
# SQLAlchemy error at runtime until the db-owning agent lands real columns.
import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from typani.result import Err, Result

from melpino_backend.auth.passwords import DUMMY_HASH, hash_password, verify_password
from melpino_backend.auth.sessions import SessionInfo, create_session, revoke_session
from melpino_backend.db.models.users import User
from melpino_backend.errors import AuthError

logger = logging.getLogger(__name__)


async def login(
    db: AsyncSession, email: str, password: str
) -> Result[tuple[str, SessionInfo], AuthError]:
    """Verifies admin/staff credentials and mints a session on success.

    Always pays the same Argon2id latency whether or not `email` matches a
    real account -- verifying against passwords.DUMMY_HASH on the
    not-found branch closes the email-enumeration timing side channel (see
    passwords.py's own doc comment).
    """
    stmt = select(User).where(User.email == email)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if user is None:
        verify_password(password, DUMMY_HASH)
        logger.info("login failed: no matching account")
        return Err(AuthError.InvalidCredentials)
    if getattr(user, "disabled_at", None) is not None:
        verify_password(password, DUMMY_HASH)
        logger.info("login failed: account disabled", extra={"user_id": str(user.id)})
        return Err(AuthError.InvalidCredentials)
    if not verify_password(password, user.password_hash):
        logger.info("login failed: bad password", extra={"user_id": str(user.id)})
        return Err(AuthError.InvalidCredentials)
    logger.info("login succeeded", extra={"user_id": str(user.id)})
    return await create_session(db, user.id, user.role)


async def logout(db: AsyncSession, session_id: UUID) -> Result[None, AuthError]:
    """Revokes the given session -- thin pass-through to auth.sessions so
    api/auth.py never touches sessions.py's row-deletion mechanics
    directly (layering rule, docs/design/01)."""
    return await revoke_session(db, session_id)


async def ensure_admin_seeded(db: AsyncSession, email: str, password: str) -> None:
    """Idempotent bootstrap admin creation -- opt-in, called every startup
    from app/app.py's lifespan when SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD
    are both set (see AppConfig's own doc comment). Safe to call on every
    process start: a no-op once the account already exists, so it never
    resets a password an operator may have since changed via the app
    itself.

    Design decision: idempotency is checked by a SELECT-then-INSERT rather
    than an upsert/ON CONFLICT, since this runs at most once per process
    startup (not on a hot path) and the plain read is easier to reason
    about here than a database-specific upsert. The SELECT fast-path is
    sequential-safe only; concurrent worker startups (multi-worker
    uvicorn/gunicorn) can race two SELECT-miss branches into the same
    INSERT, so the insert itself is still wrapped in a SAVEPOINT with the
    same `IntegrityError`-swallow-and-re-select pattern as
    `find_or_create_student` (see FINDINGS.md M1). Not a Result-returning
    function -- this is bootstrap plumbing invoked from the lifespan, not
    a caller-facing domain operation with recoverable error variants (see
    task brief: "closer to app bootstrap than domain logic").
    """
    stmt = select(User).where(User.email == email)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        logger.info("admin already seeded, skipping", extra={"email": email})
        return
    try:
        async with db.begin_nested():
            user = User(
                email=email, password_hash=hash_password(password), role="admin"
            )
            db.add(user)
            await db.flush()
    except IntegrityError:
        logger.info(
            "admin seed race: concurrent worker already seeded, re-selecting",
            extra={"email": email},
        )
        winner = (await db.execute(stmt)).scalar_one_or_none()
        if winner is None:  # pragma: no cover - defensive, should be unreachable
            raise
        return
    logger.info("seeded admin account", extra={"email": email})
