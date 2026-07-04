from __future__ import annotations

# App class: FastAPI instance, lifespan, middleware, router mounting.
# CRIB: logand.app backend/src/logand_backend/app/app.py -- copy the CSRF
# double-submit middleware's ordering/rollback lessons and the request-
# logging middleware's exception-handling lesson (Starlette's
# BaseHTTPMiddleware does not deliver exceptions past call_next to
# app.add_exception_handler) verbatim once implemented; see
# docs/design/01-backend-architecture.md and 02-auth-and-security.md for
# melpino's CSRF-exempt path list.
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from fastapi import FastAPI, Request, Response

from melpino_backend.app.config import AppConfig
from melpino_backend.logging import get_logger

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

_log = get_logger(__name__)

# CSRF-exempt paths per docs/design/01-backend-architecture.md:
# - /api/auth/login (no session cookie exists yet)
# - /api/webhooks/* (Stripe signature is the auth)
# - /api/bookings POST + /api/bookings/manage/* (guest surface: no
#   session cookie exists for guests at all; rate limits + attestation
#   are the defense instead, see docs/design/02-auth-and-security.md)
_CSRF_EXEMPT_PATHS = frozenset({"/api/auth/login"})
_CSRF_EXEMPT_PREFIXES = ("/api/webhooks", "/api/bookings")


class App:
    """Owns the FastAPI instance, lifespan, and router mounting.

    Usage (see __main__.py): `App(cfg)()` returns a built FastAPI app.
    """

    def __init__(self, config: AppConfig) -> None:
        self._config = config

    def __call__(self) -> FastAPI:
        raise NotImplementedError(
            "see docs/design/01-backend-architecture.md"
        )  # TODO(impl): build FastAPI(), register middleware, mount routers

    async def _request_logging_middleware(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """One JSON access line per request (method, path, status,
        duration_ms, request_id) -- see docs/design/01's App class section."""
        raise NotImplementedError(
            "see docs/design/01-backend-architecture.md"
        )  # TODO(impl)

    async def _csrf_middleware(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """Session-bound double-submit CSRF check for every non-exempt
        mutating request -- see docs/design/02-auth-and-security.md."""
        raise NotImplementedError(
            "see docs/design/02-auth-and-security.md"
        )  # TODO(impl)

    def _mount_routers(self, app: FastAPI) -> None:
        """Mounts every api/ router -- deferred imports so constructing an
        App for a unit test never pulls in domain/db modules unnecessarily."""
        # TODO(impl): deferred imports once each router module is real:
        # from melpino_backend.api import (
        #     admin_schedule,
        #     admin_students,
        #     auth,
        #     bookings,
        #     config_public,
        #     courses,
        #     health,
        #     invoices,
        #     invoices_public,
        #     waivers,
        #     webhooks,
        # )
        # app.include_router(health.router)
        # app.include_router(config_public.router)
        # app.include_router(auth.router)
        # app.include_router(courses.router)
        # app.include_router(bookings.router)
        # app.include_router(invoices.router)
        # app.include_router(invoices_public.router)
        # app.include_router(webhooks.router)
        # app.include_router(admin_schedule.router)
        # app.include_router(admin_students.router)
        # app.include_router(waivers.router)
        raise NotImplementedError(
            "see docs/design/01-backend-architecture.md"
        )  # TODO(impl)

    @asynccontextmanager
    async def _lifespan(self, _app: FastAPI) -> AsyncIterator[None]:
        """Initializes the DB engine, optionally seeds an admin, disposes on
        shutdown."""
        raise NotImplementedError(
            "see docs/design/01-backend-architecture.md"
        )  # TODO(impl)
        yield  # pragma: no cover -- unreachable until implemented

    async def _seed_admin_if_configured(self) -> None:
        """Opt-in admin seed via SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD --
        see AppConfig's own doc comment."""
        raise NotImplementedError(
            "see docs/design/01-backend-architecture.md"
        )  # TODO(impl)
