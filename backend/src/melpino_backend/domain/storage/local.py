from __future__ import annotations

# Zero-cost local-filesystem StorageBackend -- the scaffold default. CRIB:
# logand.app backend/src/logand_backend/domain/storage/local.py.
import asyncio
from pathlib import Path

from melpino_backend.domain.storage.base import StorageObjectNotFound


class LocalFilesystemStorage:
    """Implements StorageBackend against a local directory; url() always
    returns None (files are only ever proxied through this app's own API)."""

    def __init__(self, base_dir: str | Path) -> None:
        self._base_dir = Path(base_dir)

    def _resolve(self, key: str) -> Path:
        # `key` may contain "/" as a caller-chosen namespace separator --
        # resolve against base_dir and reject anything that would escape
        # it (e.g. a key containing "..") rather than trusting caller
        # input to already be a safe relative path.
        path = (self._base_dir / key).resolve()
        base = self._base_dir.resolve()
        if base not in path.parents and path != base:
            raise ValueError(f"storage key escapes base_dir: {key!r}")
        return path

    async def put(
        self,
        key: str,
        data: bytes,
        content_type: str,
        *,
        cache_control: str | None = None,
    ) -> None:
        """Writes bytes to base_dir/key, rejecting a key that escapes base_dir."""
        del content_type, cache_control  # no separate content-type/header slot locally
        path = self._resolve(key)
        await asyncio.to_thread(self._write_sync, path, data)

    def _write_sync(self, path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    async def get(self, key: str) -> bytes:
        """Raises StorageObjectNotFound if the file does not exist."""
        path = self._resolve(key)
        try:
            return await asyncio.to_thread(path.read_bytes)
        except FileNotFoundError as exc:
            raise StorageObjectNotFound(key) from exc

    async def delete(self, key: str) -> None:
        """No-op if the file does not exist."""
        path = self._resolve(key)
        await asyncio.to_thread(path.unlink, missing_ok=True)

    async def exists(self, key: str) -> bool:
        """Whether the file exists."""
        path = self._resolve(key)
        return await asyncio.to_thread(path.exists)

    async def url(self, key: str) -> str | None:
        """Always None -- no local backend object is ever public."""
        del key
        return None
