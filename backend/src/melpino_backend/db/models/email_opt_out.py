from __future__ import annotations

# CAN-SPAM opt-out ledger -- copied unchanged in shape from logand.app
# per docs/design/03-database.md. CRIB: logand.app
# backend/src/logand_backend/db/models -- logand tracks this as a User
# column; melpino has no student accounts, so this is its own table keyed
# by email instead (see domain/notifications/mailer.py's CRIB pointer).
from melpino_backend.db.base import Base


class EmailOptOut(Base):
    """An email address that has unsubscribed from notification emails."""

    __tablename__ = "email_opt_out"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03 -- id, email unique,
    # opted_out_at
