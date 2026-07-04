from __future__ import annotations

# Waitlist for a full ClassSession -- see docs/design/03-database.md's
# `waitlist_entries` table and docs/design/04-booking-and-scheduling.md's
# oldest-fits offer logic.
from melpino_backend.db.base import Base


class WaitlistEntry(Base):
    """One student waiting for a seat to free on a full session."""

    __tablename__ = "waitlist_entries"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03 -- id, session_id fk cascade,
    # student_id fk cascade, party_size, notified_at, created_at, unique
    # (session_id, student_id)
