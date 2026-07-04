from __future__ import annotations

# The course catalog -- see docs/design/03-database.md's `courses` table.
from melpino_backend.db.base import Base


class Course(Base):
    """What Mel teaches -- law_cert, technique, or private, with pricing."""

    __tablename__ = "courses"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03 -- id, slug unique, kind
    # check ('law_cert','technique','private'), title, summary,
    # description, price, deposit, duration_min, default_capacity,
    # is_active, created_at/updated_at
