from __future__ import annotations

# Uploaded waiver scans -- see docs/design/03-database.md's `waivers`
# table and docs/design/06-waivers-and-legal.md. PII-dense: private
# storage keys only, never a public URL (see
# docs/design/13-storage-abstraction.md).
from melpino_backend.db.base import Base


class Waiver(Base):
    """A student's uploaded waiver file, referenced by storage key."""

    __tablename__ = "waivers"
    # TEMPORARY: no columns exist yet, so SQLAlchemy has no
    # primary key to map -- __abstract__ keeps this importable as a
    # plain placeholder class. Remove once real columns land.
    __abstract__ = True
    # TODO(impl): columns per docs/design/03 -- id, student_id fk
    # restrict, session_id fk nullable, template_version, file_key,
    # content_type, file_hash, uploaded_by fk set null, created_at
