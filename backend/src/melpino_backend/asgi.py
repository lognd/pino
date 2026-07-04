from __future__ import annotations

# Module-level ASGI app for `uvicorn melpino_backend.asgi:app` (see
# backend/Dockerfile). CRIB: logand.app backend/src/logand_backend/asgi.py.
import argparse

from melpino_backend.app.app import App
from melpino_backend.app.config import AppConfig

# uvicorn's string-import form needs a plain module attribute, not a
# callable class -- an empty Namespace falls back entirely to env vars
# (loaded via load_dotenv() inside AppConfig.from_external).
app = App(AppConfig.from_external(argparse.Namespace())).__call__()
