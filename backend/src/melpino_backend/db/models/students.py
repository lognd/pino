from __future__ import annotations

# A person who has ever booked/attended -- see docs/design/03-database.md's
# `students` table. Deduped on (lower(email), lower(full_name)) at booking
# time by domain/students/service.py; no DOB/SSN/license numbers, ever
# (see docs/design/02-auth-and-security.md and 06-waivers-and-legal.md).
from melpino_backend.db.base import Base


class Student(Base):
    """A booker/attendee -- name, email, phone, admin-only notes."""

    __tablename__ = "students"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03 -- id, full_name, email
    # (not unique -- households share), phone, notes, created_at/
    # updated_at, index lower(email)
