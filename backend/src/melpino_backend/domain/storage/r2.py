from __future__ import annotations

# Cloudflare R2 (S3-API-compatible) StorageBackend -- see
# docs/design/13-storage-abstraction.md for the cost/durability comparison
# R2 was picked from. CRIB: logand.app
# backend/src/logand_backend/domain/storage/r2.py.


class CloudflareR2Storage:
    """Implements StorageBackend against an R2 bucket via boto3's S3 client."""

    def __init__(
        self,
        *,
        bucket: str,
        endpoint_url: str,
        access_key_id: str,
        secret_access_key: str,
        public_base_url: str | None = None,
    ) -> None:
        self._bucket = bucket
        self._public_base_url = public_base_url

    async def put(
        self,
        key: str,
        data: bytes,
        content_type: str,
        *,
        cache_control: str | None = None,
    ) -> None:
        """Uploads via boto3's put_object, offloaded to a thread."""
        raise NotImplementedError(
            "see docs/design/13-storage-abstraction.md"
        )  # TODO(impl)

    async def get(self, key: str) -> bytes:
        """Raises StorageObjectNotFound on a NoSuchKey/404 response."""
        raise NotImplementedError(
            "see docs/design/13-storage-abstraction.md"
        )  # TODO(impl)

    async def delete(self, key: str) -> None:
        """Deletes the object; no-op if it does not exist."""
        raise NotImplementedError(
            "see docs/design/13-storage-abstraction.md"
        )  # TODO(impl)

    async def exists(self, key: str) -> bool:
        """head_object-based existence check."""
        raise NotImplementedError(
            "see docs/design/13-storage-abstraction.md"
        )  # TODO(impl)

    async def url(self, key: str) -> str | None:
        """Real URL only when public_base_url is configured; else None."""
        raise NotImplementedError(
            "see docs/design/13-storage-abstraction.md"
        )  # TODO(impl)
