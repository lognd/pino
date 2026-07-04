from __future__ import annotations

# A guest booking against a ClassSession -- see
# docs/design/03-database.md's `bookings` table and
# docs/design/04-booking-and-scheduling.md's state machine. NOTE
# (docs/design/04's DST-of-schema wrinkle): the unique (session_id,
# student_id) constraint must be a PARTIAL unique index (status='confirmed'
# only), not a plain constraint, so a student can rebook after cancelling.
from melpino_backend.db.base import Base


class Booking(Base):
    """One guest's confirmed/cancelled/attended/no_show booking, keyed to
    a manage_token_hash (see docs/design/02-auth-and-security.md)."""

    __tablename__ = "bookings"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03 -- id, session_id fk,
    # student_id fk, party_size check (>=1), status check
    # (confirmed/cancelled/attended/no_show), manage_token_hash unique,
    # attested_at, attestation_version, sms_consent, invoice_id fk
    # nullable, cancelled_at, created_at/updated_at, PARTIAL unique
    # (session_id, student_id) where status='confirmed'
