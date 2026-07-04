from __future__ import annotations

# The StorageBackend Protocol every caller (waivers, future course PDFs)
# is written against -- domain code never imports LocalFilesystemStorage or
# CloudflareR2Storage directly. CRIB: logand.app
# backend/src/logand_backend/domain/storage/base.py (copied verbatim; same
# Protocol shape, no melpino-specific changes).
from typing import Protocol


class StorageBackend(Protocol):
    """Swappable put/get/delete/exists/url interface -- `key` is always a
    caller-chosen path, never a full URL."""

    async def put(
        self,
        key: str,
        data: bytes,
        content_type: str,
        *,
        cache_control: str | None = None,
    ) -> None:
        """Writes `data` to `key`, creating or overwriting it."""
        ...

    async def get(self, key: str) -> bytes:
        """Raises StorageObjectNotFound if `key` doesn't exist."""
        ...

    async def delete(self, key: str) -> None:
        """A no-op (not an error) if `key` doesn't exist."""
        ...

    async def exists(self, key: str) -> bool: ...

    async def url(self, key: str) -> str | None:
        """A directly fetchable URL for `key`, or None if this backend has
        no such thing."""
        ...


class StorageObjectNotFound(Exception):
    """Raised by get() when `key` does not exist in the backend."""

    def __init__(self, key: str) -> None:
        super().__init__(f"storage object not found: {key}")
        self.key = key
