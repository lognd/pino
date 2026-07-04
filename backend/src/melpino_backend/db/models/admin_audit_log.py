from __future__ import annotations

# Admin action audit trail -- copied unchanged in shape from logand.app
# per docs/design/03-database.md. CRIB: logand.app
# backend/src/logand_backend/db/models/audit.py.
from melpino_backend.db.base import Base


class AdminAuditLog(Base):
    """One row per admin-initiated write, for after-the-fact review."""

    __tablename__ = "admin_audit_log"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03 -- id, user_id fk, action,
    # table_name, row_id, before_state, after_state, created_at
