from __future__ import annotations

# Admin/staff user accounts -- see docs/design/03-database.md. CRIB:
# logand.app backend/src/logand_backend/db/models/users.py (adds a
# role in ('admin','staff') check instead of logand's ('admin','customer'),
# since melpino has no customer accounts at all).
from melpino_backend.db.base import Base


class User(Base):
    """An admin/staff account -- see docs/design/02-auth-and-security.md's
    authorization model (admin, staff)."""

    __tablename__ = "users"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03 -- id, email, password_hash,
    # role check ('admin','staff'), disabled_at, created_at/updated_at
