from __future__ import annotations

# Admin password-reset tokens -- copied unchanged in shape from
# logand.app per docs/design/03-database.md. CRIB: logand.app
# backend/src/logand_backend/db/models/password_reset_tokens.py.
from melpino_backend.db.base import Base


class PasswordResetToken(Base):
    """A single-use, hashed, time-limited admin password-reset token."""

    __tablename__ = "password_reset_tokens"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03 -- id, user_id fk, token_hash
    # unique, expires_at, used_at, created_at
