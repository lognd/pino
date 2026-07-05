"""bookings.source: web vs admin-manual origin tracking

The owner's site-fee billing is keyed to how many bookings the site
itself produced vs what Mel typed in manually, so every booking row
records its origin. Existing rows predate manual entry and are all
site bookings -- the 'web' default backfills them correctly.

Revision ID: 0001_booking_source
Revises: 0000_initial_schema
Create Date: 2026-07-05 00:00:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_booking_source"
down_revision: Union[str, None] = "0000_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookings",
        sa.Column("source", sa.Text(), nullable=False, server_default="web"),
    )
    op.create_check_constraint(
        "ck_bookings_source", "bookings", "source in ('web', 'admin')"
    )
    # The metrics endpoint groups by (source, month(created_at)) over the
    # whole table; a plain source index keeps that cheap at any size.
    op.create_index("ix_bookings_source", "bookings", ["source"])


def downgrade() -> None:
    op.drop_index("ix_bookings_source", table_name="bookings")
    op.drop_constraint("ck_bookings_source", "bookings", type_="check")
    op.drop_column("bookings", "source")
