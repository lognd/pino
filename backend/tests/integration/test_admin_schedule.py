from __future__ import annotations

# Integration coverage for admin schedule/roster stubs -- see
# docs/design/14-admin-mockup.md and docs/design/04-booking-and-scheduling.md.
import pytest


@pytest.mark.skip(reason="TODO(impl): see docs/design/04-booking-and-scheduling.md")
async def test_staff_cannot_issue_refunds() -> None:
    """Depends(require_staff) rejects a staff-role session on the refund route
    (admin-only per docs/design/02's authorization model)."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/04-booking-and-scheduling.md")
async def test_on_behalf_booking_records_admin_phone_attestation() -> None:
    """An admin phone booking skips rate limits and sets
    attestation_version='admin-phone'."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/04-booking-and-scheduling.md")
async def test_course_session_overlap_is_rejected() -> None:
    """Scheduling a session overlapping another on the same course
    returns SessionOverlap."""
