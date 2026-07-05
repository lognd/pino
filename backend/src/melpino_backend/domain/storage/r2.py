from __future__ import annotations

# Cloudflare R2 (S3-API-compatible) StorageBackend -- see
# docs/design/13-storage-abstraction.md for the cost/durability comparison
# R2 was picked from. CRIB: logand.app
# backend/src/logand_backend/domain/storage/r2.py.
import asyncio
from typing import Any

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from melpino_backend.domain.storage.base import StorageObjectNotFound
from melpino_backend.logging import get_logger

_log = get_logger(__name__)

# Melpino's one behavioral addition over logand's copied backend (see doc
# 13): private vs public is a property of the KEY NAMESPACE, not per-call
# judgment. Only these prefixes are ever allowed to resolve to a public
# URL, even when a public base is configured -- waivers/ and
# payment-proofs/ (and anything else not on this list) must always proxy
# through the app's own authenticated API instead. Add new public
# namespaces here first (doc 13's namespace list is the source of truth).
_PUBLIC_KEY_PREFIXES = ("course-media/", "brand/", "gallery/")


def is_public_key(key: str) -> bool:
    """Whether `key` falls under a namespace allowlisted as public (doc
    13) -- the one chokepoint deciding if url() may ever return a real
    URL for this key, regardless of whether a public base is configured."""
    return key.startswith(_PUBLIC_KEY_PREFIXES)


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
        # signature_version="s3v4" -- R2 requires this explicitly; boto3's
        # own default doesn't always negotiate it correctly against a
        # non-AWS S3-compatible endpoint.
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            config=BotoConfig(signature_version="s3v4"),
            region_name="auto",
        )

    async def put(
        self,
        key: str,
        data: bytes,
        content_type: str,
        *,
        cache_control: str | None = None,
    ) -> None:
        """Uploads via boto3's put_object, offloaded to a thread."""
        await asyncio.to_thread(self._put_sync, key, data, content_type, cache_control)

    def _put_sync(
        self, key: str, data: bytes, content_type: str, cache_control: str | None
    ) -> None:
        extra: dict[str, Any] = {}
        if cache_control is not None:
            extra["CacheControl"] = cache_control
        try:
            self._client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
                **extra,
            )
        except ClientError:
            _log.error("r2 upload failed", exc_info=True, extra={"key": key})
            raise

    async def get(self, key: str) -> bytes:
        """Raises StorageObjectNotFound on a NoSuchKey/404 response."""
        return await asyncio.to_thread(self._get_sync, key)

    def _get_sync(self, key: str) -> bytes:
        try:
            resp: dict[str, Any] = self._client.get_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code")
            if code in ("NoSuchKey", "404"):
                raise StorageObjectNotFound(key) from exc
            _log.error("r2 download failed", exc_info=True, extra={"key": key})
            raise
        return resp["Body"].read()

    async def delete(self, key: str) -> None:
        """Deletes the object; no-op if it does not exist."""
        await asyncio.to_thread(
            self._client.delete_object, Bucket=self._bucket, Key=key
        )

    async def exists(self, key: str) -> bool:
        """head_object-based existence check."""
        try:
            await asyncio.to_thread(
                self._client.head_object, Bucket=self._bucket, Key=key
            )
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code")
            if code in ("404", "NoSuchKey"):
                return False
            raise
        return True

    async def url(self, key: str) -> str | None:
        """Real URL only when public_base_url is configured AND `key`
        falls under an allowlisted public namespace (doc 13) -- else None,
        even for a private key with a public base configured."""
        if self._public_base_url is None:
            return None
        if not is_public_key(key):
            return None
        return f"{self._public_base_url.rstrip('/')}/{key}"
