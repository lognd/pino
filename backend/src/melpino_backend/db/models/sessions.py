from __future__ import annotations

# Admin auth sessions -- see docs/design/02-auth-and-security.md. CRIB:
# logand.app backend/src/logand_backend/db/models/sessions.py.
from melpino_backend.db.base import Base


class Session(Base):
    """A server-side admin session row (token_hash, csrf_secret, expiry)."""

    __tablename__ = "sessions"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03 -- id, user_id fk, token_hash
    # unique, csrf_secret, expires_at, created_at, last_seen_at
