from __future__ import annotations

# Idempotency ledger for the reminder/notification scheduler -- see
# docs/design/03-database.md's `reminders_sent` table and
# docs/design/04-booking-and-scheduling.md's scheduler section.
from melpino_backend.db.base import Base


class ReminderSent(Base):
    """Records that a given (booking, kind) notification has already fired."""

    __tablename__ = "reminders_sent"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03 -- id, booking_id fk cascade,
    # kind check (confirmation/reminder/waitlist_offer/cancellation),
    # sent_at, unique (booking_id, kind)
