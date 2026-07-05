"""students: unique index on (lower(email), lower(full_name))

find_or_create_student did a SELECT-then-INSERT dedup check with no
schema-level backstop, so two concurrent bookings by the same NEW
person on DIFFERENT sessions (no shared session-row lock) could each
miss the dedup SELECT and insert two Student rows for one person,
splitting roster/booking history. This adds the unique index the
service's dedup key was always supposed to be backed by; the service
now catches the resulting IntegrityError and re-selects the winner.

Revision ID: 0002_students_dedup_unique
Revises: 0001_booking_source
Create Date: 2026-07-05 00:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_students_dedup_unique"
down_revision: Union[str, None] = "0001_booking_source"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "uq_students_lower_email_lower_full_name",
        "students",
        [sa.text("lower(email)"), sa.text("lower(full_name)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_students_lower_email_lower_full_name", table_name="students")
