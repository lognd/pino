from __future__ import annotations

# The one place that knows about every concrete StorageBackend
# implementation. CRIB: logand.app
# backend/src/logand_backend/domain/storage/factory.py.
from typing import TYPE_CHECKING

from melpino_backend.domain.storage.base import StorageBackend

if TYPE_CHECKING:
    from melpino_backend.app.config import AppConfig


def get_storage_backend(cfg: "AppConfig") -> StorageBackend:
    """Returns LocalFilesystemStorage or CloudflareR2Storage per
    cfg.storage_backend."""
    raise NotImplementedError("see docs/design/13-storage-abstraction.md")  # TODO(impl)
