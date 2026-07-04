from __future__ import annotations

# Argon2id password hashing for admin/staff accounts -- see
# docs/design/02-auth-and-security.md. CRIB: logand.app
# backend/src/logand_backend/auth/passwords.py (time_cost=3,
# memory_cost=64MB, parallelism=4, plus a fixed dummy-hash timing-parity
# constant for the "user does not exist" login branch).
import logging

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

logger = logging.getLogger(__name__)

# Params per docs/design/02-auth-and-security.md: time_cost=3,
# memory_cost=64MB (65536 KiB), parallelism=4.
_HASHER = PasswordHasher(time_cost=3, memory_cost=64 * 1024, parallelism=4)

# Fixed dummy hash for the "user does not exist" login branch (see
# api/auth.py's login handler): verifying against this constant hash makes
# that branch pay the same argon2 latency as the "user exists, wrong
# password" branch, closing a timing side-channel that would otherwise let
# an attacker enumerate valid admin emails by response time. Generated once
# from an arbitrary raw string; the raw value itself is irrelevant since no
# real password is ever checked against it correctly.
DUMMY_HASH = _HASHER.hash("dummy-password-for-timing-parity")


def hash_password(raw: str) -> str:
    """Hashes a raw password with Argon2id per docs/design/02's params."""
    logger.debug("hashing a new password")
    return _HASHER.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    """Verifies a raw password against a stored Argon2id hash."""
    try:
        return _HASHER.verify(hashed, raw)
    except VerifyMismatchError:
        logger.info("password verification failed: mismatch")
        return False
