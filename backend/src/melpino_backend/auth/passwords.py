from __future__ import annotations

# Argon2id password hashing for admin/staff accounts -- see
# docs/design/02-auth-and-security.md. CRIB: logand.app
# backend/src/logand_backend/auth/passwords.py (time_cost=3,
# memory_cost=64MB, parallelism=4, plus a fixed dummy-hash timing-parity
# constant for the "user does not exist" login branch).


def hash_password(raw: str) -> str:
    """Hashes a raw password with Argon2id per docs/design/02's params."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)


def verify_password(raw: str, hashed: str) -> bool:
    """Verifies a raw password against a stored Argon2id hash."""
    raise NotImplementedError("see docs/design/02-auth-and-security.md")  # TODO(impl)
