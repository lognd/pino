from __future__ import annotations

import asyncio
import hashlib
import json
import mimetypes
import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Uploads gallery media to Cloudflare R2 under the `gallery/` namespace --
# docs/design/15-media-and-gallery.md's "Serving through R2". Adapted from
# ~/projects/logand.app/ops/sync_public_media.py (MECHANICS cribbed: a
# local-media manifest, a content-hash cache so unchanged files aren't
# re-uploaded, immutable hash-suffixed keys + long cache-control). Renamed
# and re-namespaced for melpino; NOT a byte-for-byte copy of logand's.
#
# HUMAN INPUT / P7: actually RUNNING this requires the real R2 bucket, which
# does not exist until deploy (P7). It reads its credentials from the
# environment (never from a checked-in .env), so a human must export/point
# it at the P7 bucket before running:
#
#   R2_BUCKET=...            R2_ENDPOINT_URL=https://<acct>.r2.cloudflarestorage.com
#   R2_ACCESS_KEY_ID=...     R2_SECRET_ACCESS_KEY=...
#   R2_PUBLIC_BASE_URL=https://files.<domain>   (the gallery/ public base)
#
#   uv run --project backend python ops/sync_public_media.py
#
# It uploads every file under frontend/public/local-media/ to
# gallery/<stem>-<hash8><ext>, writes long-lived immutable cache-control, and
# emits a manifest (frontend/public/local-media/.gallery_manifest.json)
# mapping each local filename to its public key + URL, so content/media.ts can
# be pointed at the real URLs. Unchanged files (same content hash) are
# skipped on re-run.
# ---------------------------------------------------------------------------

_REPO_ROOT = Path(__file__).resolve().parent.parent
_MEDIA_DIR = _REPO_ROOT / "frontend" / "public" / "local-media"
_MANIFEST_PATH = _MEDIA_DIR / ".gallery_manifest.json"
_GALLERY_PREFIX = "gallery/"
# One year, immutable -- the hash-suffixed key changes whenever the bytes do,
# so a caller can cache forever without ever seeing a stale object.
_CACHE_CONTROL = "public, max-age=31536000, immutable"

# Only these media types are ever uploaded (defensive: never push a stray
# .env or editor tempfile that happened to land in local-media/).
_ALLOWED_SUFFIXES = {".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm"}


def _content_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _gallery_key(path: Path, digest: str) -> str:
    """Immutable, hash-suffixed key under gallery/ -- <stem>-<hash8><ext>."""
    return f"{_GALLERY_PREFIX}{path.stem}-{digest[:8]}{path.suffix.lower()}"


def _load_manifest() -> dict[str, dict[str, str]]:
    if not _MANIFEST_PATH.exists():
        return {}
    return json.loads(_MANIFEST_PATH.read_text())


def _require_env() -> dict[str, str]:
    required = (
        "R2_BUCKET",
        "R2_ENDPOINT_URL",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
    )
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        print(
            "error: missing required env var(s): "
            + ", ".join(missing)
            + " -- this script needs the P7 R2 bucket credentials (HUMAN "
            "INPUT). See this file's header for the full list.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return {name: os.environ[name] for name in required}


async def _upload(
    env: dict[str, str], public_base: str, to_upload: list[Path]
) -> dict[str, dict[str, str]]:
    # Imported lazily so `--help`/env-check paths don't require the backend
    # package (and boto3) to be importable.
    sys.path.insert(0, str(_REPO_ROOT / "backend" / "src"))
    from melpino_backend.domain.storage.r2 import CloudflareR2Storage, is_public_key

    storage = CloudflareR2Storage(
        bucket=env["R2_BUCKET"],
        endpoint_url=env["R2_ENDPOINT_URL"],
        access_key_id=env["R2_ACCESS_KEY_ID"],
        secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        public_base_url=public_base,
    )

    results: dict[str, dict[str, str]] = {}
    for path in to_upload:
        digest = _content_hash(path)
        key = _gallery_key(path, digest)
        # Sanity: the key MUST resolve as public (doc 13's namespace guard);
        # a typo in _GALLERY_PREFIX would otherwise upload unservable objects.
        assert is_public_key(key), f"key not in a public namespace: {key}"
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        data = path.read_bytes()
        await storage.put(key, data, content_type, cache_control=_CACHE_CONTROL)
        url = await storage.url(key)
        assert url is not None, "public_base_url must yield a URL for a gallery key"
        print(f"sync_public_media: uploaded {path.name} -> {key}")
        results[path.name] = {"hash": digest, "key": key, "url": url}
    return results


def main() -> int:
    if not _MEDIA_DIR.exists():
        print(f"no {_MEDIA_DIR} directory, nothing to sync")
        return 0

    env = _require_env()
    public_base = os.environ.get("R2_PUBLIC_BASE_URL")
    if not public_base:
        print(
            "error: R2_PUBLIC_BASE_URL is required so the emitted manifest "
            "carries real gallery/ URLs for content/media.ts.",
            file=sys.stderr,
        )
        return 1

    manifest = _load_manifest()
    files = sorted(
        p
        for p in _MEDIA_DIR.iterdir()
        if p.is_file() and p != _MANIFEST_PATH and p.suffix.lower() in _ALLOWED_SUFFIXES
    )

    to_upload = [
        p for p in files if manifest.get(p.name, {}).get("hash") != _content_hash(p)
    ]
    if not to_upload:
        print("sync_public_media: nothing changed, nothing to upload")
        return 0

    print(
        f"sync_public_media: uploading {len(to_upload)} new/changed "
        f"file(s) to {_GALLERY_PREFIX}"
    )
    uploaded = asyncio.run(_upload(env, public_base, to_upload))

    manifest.update(uploaded)
    _MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(f"sync_public_media: wrote {_MANIFEST_PATH.relative_to(_REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
