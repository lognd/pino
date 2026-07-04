from __future__ import annotations

# A scheduled occurrence of a course -- see docs/design/03-database.md's
# `class_sessions` table. Private 1:1 slots are rows with capacity=1 on a
# course of kind='private' -- no separate appointments table (locked
# decision, see docs/design/04-booking-and-scheduling.md).
from melpino_backend.db.base import Base


class ClassSession(Base):
    """A bookable date/time occurrence of a Course, with its own capacity
    and status (draft/published/full/completed/cancelled)."""

    __tablename__ = "class_sessions"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03 -- id, course_id fk, starts_at,
    # ends_at, location_name, location_addr, capacity check (>=1), status
    # check (draft/published/full/completed/cancelled), notes,
    # created_at/updated_at, index (status, starts_at)
