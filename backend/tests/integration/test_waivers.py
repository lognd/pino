from __future__ import annotations

# Integration coverage for waiver upload/storage/streaming -- see
# docs/design/06-waivers-and-legal.md and docs/design/13-storage-abstraction.md.
import pytest


@pytest.mark.skip(reason="TODO(impl): see docs/design/06-waivers-and-legal.md")
async def test_unsupported_content_type_is_rejected() -> None:
    """Uploading a waiver with a non-allowlisted content type returns
    UnsupportedContentType."""


@pytest.mark.skip(reason="TODO(impl): see docs/design/06-waivers-and-legal.md")
async def test_waiver_download_never_exposes_a_public_url() -> None:
    """storage.url() for a waiver key is None; bytes are only ever
    streamed through the API."""
