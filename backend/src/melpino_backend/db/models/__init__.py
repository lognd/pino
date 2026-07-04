from __future__ import annotations

# Imports every model module so Base.metadata is fully populated for
# Alembic autogenerate and Base.metadata.create_all() in tests -- see
# db/migrations/env.py's own comment on why this import matters even
# though nothing here references the names directly.
from melpino_backend.db.models import (  # noqa: F401
    admin_audit_log,
    bookings,
    class_sessions,
    courses,
    email_opt_out,
    invoices,
    password_reset_tokens,
    reminders,
    sessions,
    students,
    users,
    waitlist_entries,
    waivers,
)

__all__ = [
    "admin_audit_log",
    "bookings",
    "class_sessions",
    "courses",
    "email_opt_out",
    "invoices",
    "password_reset_tokens",
    "reminders",
    "sessions",
    "students",
    "users",
    "waitlist_entries",
    "waivers",
]
