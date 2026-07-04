from __future__ import annotations

# get_logger + lazy dictConfig init, per ~/.claude/refs/logging.md.
# CRIB: logand.app backend/src/logand_backend/logging/logger.py.
import logging
import logging.config
import os
import tomllib
from pathlib import Path

_CONFIG_PATH = Path(__file__).parent / "config.toml"
_initialized = False

# Every process (API server, scheduler, one-off scripts) writes to the
# SAME directory -- centralized, not scattered. Overridable via LOG_DIR
# for containerized deployments (compose mounts a shared volume here so
# the API and scheduler containers' logs land in one place on the host).
DEFAULT_LOG_DIR = "./logs"


def _init() -> None:
    global _initialized
    if _initialized:
        return
    with _CONFIG_PATH.open("rb") as f:
        cfg = tomllib.load(f)

    dir_path = log_dir()
    dir_path.mkdir(parents=True, exist_ok=True)
    cfg["handlers"]["file"]["filename"] = str(dir_path / "app.log")

    logging.config.dictConfig(cfg)
    _initialized = True


def get_logger(name: str) -> logging.Logger:
    """Returns a stdlib logger, initializing the dictConfig on first call."""
    _init()
    return logging.getLogger(name)


def log_dir() -> Path:
    """The directory get_logger() is (or will be) writing to -- shared so
    callers (retention sweep, future admin log views) never duplicate the
    LOG_DIR-resolution logic."""
    return Path(os.environ.get("LOG_DIR", DEFAULT_LOG_DIR))
