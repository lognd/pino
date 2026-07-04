from __future__ import annotations

# Production health probe: checks every real subsystem/dependency (DB,
# redis, Stripe, PayPal, SMTP, storage backend, latexmk) against whatever
# AppConfig currently resolves to. See Makefile's `healthcheck` target.
# CRIB: logand.app backend/src/logand_backend/scripts/health_check.py.
import argparse


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="melpino-backend-healthcheck")
    parser.add_argument(
        "--skip-http",
        action="store_true",
        help="skip the public-reachability check (no live domain locally)",
    )
    return parser


async def run_healthcheck(*, skip_http: bool) -> int:
    """Runs every subsystem check; returns a process exit code."""
    raise NotImplementedError("see docs/design/11-deployment.md")  # TODO(impl)


def main() -> None:
    """CLI entry point -- `python -m melpino_backend.scripts.health_check`."""
    raise NotImplementedError("see docs/design/11-deployment.md")  # TODO(impl)


if __name__ == "__main__":
    main()
