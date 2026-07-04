from __future__ import annotations

# CLI entry point: argparse -> AppConfig.from_external -> uvicorn.run(App(cfg)()).
# CRIB: logand.app backend/src/logand_backend/__main__.py.
import argparse

import uvicorn

from melpino_backend.app.app import App
from melpino_backend.app.config import AppConfig


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="melpino-backend")
    parser.add_argument("--host", default=None)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--database-url", dest="database_url", default=None)
    return parser


def main() -> None:
    """Parses CLI args, builds AppConfig, and runs uvicorn against App(cfg)()."""
    args = _build_parser().parse_args()
    cfg = AppConfig.from_external(args)
    uvicorn.run(App(cfg)(), host=cfg.host, port=cfg.port)


if __name__ == "__main__":
    main()
