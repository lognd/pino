from __future__ import annotations

# Zero-cost local-filesystem StorageBackend -- the scaffold default. CRIB:
# logand.app backend/src/logand_backend/domain/storage/local.py.
from pathlib import Path


class LocalFilesystemStorage:
    """Implements StorageBackend against a local directory; url() always
    returns None (files are only ever proxied through this app's own API)."""

    def __init__(self, base_dir: str | Path) -> None:
        self._base_dir = Path(base_dir)

    async def put(
        self,
        key: str,
        data: bytes,
        content_type: str,
        *,
        cache_control: str | None = None,
    ) -> None:
        """Writes bytes to base_dir/key, rejecting a key that escapes base_dir."""
        raise NotImplementedError(
            "see docs/design/13-storage-abstraction.md"
        )  # TODO(impl)

    async def get(self, key: str) -> bytes:
        """Raises StorageObjectNotFound if the file does not exist."""
        raise NotImplementedError(
            "see docs/design/13-storage-abstraction.md"
        )  # TODO(impl)

    async def delete(self, key: str) -> None:
        """No-op if the file does not exist."""
        raise NotImplementedError(
            "see docs/design/13-storage-abstraction.md"
        )  # TODO(impl)

    async def exists(self, key: str) -> bool:
        """Whether the file exists."""
        raise NotImplementedError(
            "see docs/design/13-storage-abstraction.md"
        )  # TODO(impl)

    async def url(self, key: str) -> str | None:
        """Always None -- no local backend object is ever public."""
        raise NotImplementedError(
            "see docs/design/13-storage-abstraction.md"
        )  # TODO(impl)
