from __future__ import annotations

# Storage backend coverage -- local round-trip, moto-backed R2, missing-
# key, idempotent delete, and the namespace-privacy guard (doc 13's one
# behavioral addition over logand's copied backend). CRIB: logand.app
# backend/tests/unit/test_storage.py.
import boto3
import pytest
from moto import mock_aws

from melpino_backend.app.config import AppConfig
from melpino_backend.domain.storage.base import StorageObjectNotFound
from melpino_backend.domain.storage.factory import get_storage_backend
from melpino_backend.domain.storage.local import LocalFilesystemStorage
from melpino_backend.domain.storage.r2 import CloudflareR2Storage, is_public_key

# LocalFilesystemStorage: real filesystem I/O against a pytest tmp_path,
# not a mocked Path -- "real infra over mocks" per this codebase's
# testing convention.


async def test_local_put_get_roundtrip(tmp_path) -> None:
    storage = LocalFilesystemStorage(tmp_path)
    await storage.put("a/b/c.txt", b"hello world", "text/plain")
    assert await storage.get("a/b/c.txt") == b"hello world"
    assert await storage.exists("a/b/c.txt") is True


async def test_local_get_missing_raises_not_found(tmp_path) -> None:
    storage = LocalFilesystemStorage(tmp_path)
    with pytest.raises(StorageObjectNotFound):
        await storage.get("nope.txt")


async def test_local_exists_false_for_missing_key(tmp_path) -> None:
    storage = LocalFilesystemStorage(tmp_path)
    assert await storage.exists("nope.txt") is False


async def test_local_delete_is_idempotent(tmp_path) -> None:
    storage = LocalFilesystemStorage(tmp_path)
    await storage.delete("never-existed.txt")  # must not raise
    await storage.put("x.txt", b"data", "text/plain")
    await storage.delete("x.txt")
    await storage.delete("x.txt")  # second delete, still must not raise
    assert await storage.exists("x.txt") is False


async def test_local_url_is_always_none(tmp_path) -> None:
    storage = LocalFilesystemStorage(tmp_path)
    await storage.put("x.txt", b"data", "text/plain")
    assert await storage.url("x.txt") is None


def test_local_rejects_key_that_escapes_base_dir(tmp_path) -> None:
    storage = LocalFilesystemStorage(tmp_path)
    with pytest.raises(ValueError):
        storage._resolve("../../etc/passwd")


# CloudflareR2Storage: exercised against moto's real in-process S3 API
# double, not a monkeypatched method.


@pytest.fixture
def r2_storage():
    with mock_aws():
        client = boto3.client(
            "s3",
            region_name="us-east-1",
            aws_access_key_id="x",
            aws_secret_access_key="x",
        )
        client.create_bucket(Bucket="test-bucket")
        yield CloudflareR2Storage(
            bucket="test-bucket",
            endpoint_url="https://s3.amazonaws.com",
            access_key_id="x",
            secret_access_key="x",
            public_base_url="https://files.example.com",
        )


async def test_r2_put_get_roundtrip(r2_storage: CloudflareR2Storage) -> None:
    key = "course-media/sailing-101/photo.jpg"
    await r2_storage.put(key, b"jpeg-bytes", "image/jpeg")
    assert await r2_storage.get("course-media/sailing-101/photo.jpg") == b"jpeg-bytes"
    assert await r2_storage.exists("course-media/sailing-101/photo.jpg") is True


async def test_r2_get_missing_raises_not_found(r2_storage: CloudflareR2Storage) -> None:
    with pytest.raises(StorageObjectNotFound):
        await r2_storage.get("nope.jpg")


async def test_r2_exists_false_for_missing_key(r2_storage: CloudflareR2Storage) -> None:
    assert await r2_storage.exists("nope.jpg") is False


async def test_r2_delete_is_idempotent(r2_storage: CloudflareR2Storage) -> None:
    await r2_storage.put("course-media/x.txt", b"data", "text/plain")
    await r2_storage.delete("course-media/x.txt")
    await r2_storage.delete("course-media/x.txt")  # second delete must not raise
    assert await r2_storage.exists("course-media/x.txt") is False


async def test_r2_url_uses_public_base_url_for_course_media(
    r2_storage: CloudflareR2Storage,
) -> None:
    assert (
        await r2_storage.url("course-media/sailing-101/a.jpg")
        == "https://files.example.com/course-media/sailing-101/a.jpg"
    )


async def test_r2_url_uses_public_base_url_for_brand(
    r2_storage: CloudflareR2Storage,
) -> None:
    assert (
        await r2_storage.url("brand/hero/poster.jpg")
        == "https://files.example.com/brand/hero/poster.jpg"
    )


async def test_r2_url_none_without_public_base_url() -> None:
    with mock_aws():
        storage = CloudflareR2Storage(
            bucket="b",
            endpoint_url="https://s3.amazonaws.com",
            access_key_id="x",
            secret_access_key="x",
        )
        assert await storage.url("course-media/a.jpg") is None


# The namespace-privacy guard -- doc 13's flagship test. A waiver (or
# payment-proof, or any key outside the public allowlist) must NEVER
# resolve to a public URL, even when a public base IS configured.


async def test_r2_url_is_none_for_waivers_even_with_public_base_configured(
    r2_storage: CloudflareR2Storage,
) -> None:
    await r2_storage.put(
        "waivers/11111111-1111-1111-1111-111111111111/w.pdf",
        b"pdf-bytes",
        "application/pdf",
    )
    assert (
        await r2_storage.url("waivers/11111111-1111-1111-1111-111111111111/w.pdf")
        is None
    )


async def test_r2_url_is_none_for_payment_proofs_even_with_public_base_configured(
    r2_storage: CloudflareR2Storage,
) -> None:
    assert await r2_storage.url("payment-proofs/some-invoice/proof.png") is None


async def test_r2_url_is_none_for_unlisted_namespace(
    r2_storage: CloudflareR2Storage,
) -> None:
    assert await r2_storage.url("some-random-prefix/file.txt") is None


def test_is_public_key_allowlist() -> None:
    assert is_public_key("course-media/foo.jpg") is True
    assert is_public_key("brand/hero/poster.jpg") is True
    assert is_public_key("waivers/1/2.pdf") is False
    assert is_public_key("payment-proofs/1/2.png") is False
    assert is_public_key("") is False


# get_storage_backend factory


def test_factory_returns_local_by_default() -> None:
    cfg = AppConfig()
    backend = get_storage_backend(cfg)
    assert isinstance(backend, LocalFilesystemStorage)


def test_factory_returns_r2_when_configured() -> None:
    cfg = AppConfig(
        storage_backend="r2",
        r2_bucket="b",
        r2_endpoint_url="https://example.com",
        r2_access_key_id="x",
        r2_secret_access_key="x",
    )
    backend = get_storage_backend(cfg)
    assert isinstance(backend, CloudflareR2Storage)


def test_factory_raises_when_r2_selected_but_not_configured() -> None:
    cfg = AppConfig(storage_backend="r2")
    with pytest.raises(RuntimeError):
        get_storage_backend(cfg)


def test_factory_raises_on_unknown_backend() -> None:
    cfg = AppConfig(storage_backend="dropbox")
    with pytest.raises(RuntimeError):
        get_storage_backend(cfg)
