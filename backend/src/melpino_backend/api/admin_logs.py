from __future__ import annotations

# Admin log access -- CRIB: logand.app backend/src/logand_backend/api/
# admin_logs.py, endpoint-for-endpoint (list rotated files, tail the live
# file, download one). Every log line is one JSON object (see
# logging/json_formatter.py), so the admin portal parses and renders the
# tail directly.
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from melpino_backend.auth.sessions import SessionInfo, require_staff
from melpino_backend.logging.logger import log_dir

router = APIRouter(prefix="/api/admin/logs", tags=["admin-logs"])

_LIVE_FILE = "app.log"


def _safe_log_path(name: str) -> None:
    """Every filename here is admin-supplied via a path segment -- reject
    anything that isn't a bare filename inside log_dir() (no "..", no "/")
    before ever touching the filesystem with it."""
    if "/" in name or "\\" in name or ".." in name:
        raise HTTPException(status_code=400, detail="invalid log file name")
    if name != _LIVE_FILE and not name.startswith(f"{_LIVE_FILE}."):
        raise HTTPException(status_code=404, detail="no such log file")


@router.get("/files")
async def list_log_files(
    _admin: SessionInfo = Depends(require_staff),
) -> list[dict]:
    """Every rotated + the live log file, newest first -- what an admin
    picks from before downloading one. logging/retention.py thins old
    files so this list never grows unbounded."""
    directory = log_dir()
    if not directory.exists():
        return []
    files = sorted(
        directory.glob(f"{_LIVE_FILE}*"), key=lambda p: p.stat().st_mtime, reverse=True
    )
    return [
        {
            "name": p.name,
            "size_bytes": p.stat().st_size,
            "modified_at": p.stat().st_mtime,
        }
        for p in files
    ]


@router.get("/tail")
async def tail_live_log(
    lines: int = 200,
    _admin: SessionInfo = Depends(require_staff),
) -> list[str]:
    """The most recent N lines of the LIVE log file -- "what just
    happened," without downloading the whole thing."""
    lines = max(1, min(lines, 2000))
    path = log_dir() / _LIVE_FILE
    if not path.exists():
        return []
    all_lines = path.read_text(errors="replace").splitlines()
    return all_lines[-lines:]


@router.get("/files/{name}")
async def download_log_file(
    name: str,
    _admin: SessionInfo = Depends(require_staff),
) -> FileResponse:
    _safe_log_path(name)
    path = log_dir() / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="no such log file")
    return FileResponse(path, media_type="application/x-ndjson", filename=name)
