from __future__ import annotations

# App class: FastAPI instance, lifespan, middleware, router mounting.
# CRIB: logand.app backend/src/logand_backend/app/app.py -- the CSRF
# double-submit middleware's ordering/rollback lessons and the request-
# logging middleware's exception-handling lesson (Starlette's
# BaseHTTPMiddleware does not deliver exceptions past call_next to
# app.add_exception_handler) copied verbatim; see
# docs/design/01-backend-architecture.md and 02-auth-and-security.md for
# melpino's CSRF-exempt path list.
import time
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from melpino_backend.app.config import AppConfig
from melpino_backend.logging import get_logger
from melpino_backend.logging.request_context import new_request_id, set_request_id

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

_log = get_logger(__name__)
_access_log = get_logger("melpino_backend.access")

# CSRF-exempt paths per docs/design/01-backend-architecture.md:
# - /api/auth/login (no session cookie exists yet)
# - /api/webhooks/* (Stripe signature is the auth)
# - /api/bookings POST + /api/bookings/manage/* (guest surface: no
#   session cookie exists for guests at all; rate limits + attestation
#   are the defense instead, see docs/design/02-auth-and-security.md)
# - /api/pay/* (docs/design/05's pay-by-link surface, and 01's guest-
#   surface CSRF reasoning above applies identically here: a guest
#   paying an invoice has no admin session cookie at all -- there is no
#   session to CSRF against in the first place. The pay TOKEN itself is
#   the auth (see domain/invoices/service.py's find_invoice_by_pay_token,
#   same mint/hash/404-on-any-failure discipline as booking manage
#   tokens), so double-submit CSRF protection would be defending nothing
#   here while adding no real safety.
_CSRF_EXEMPT_PATHS = frozenset({"/api/auth/login"})
_CSRF_EXEMPT_PREFIXES = ("/api/webhooks", "/api/bookings", "/api/pay")


class App:
    """Owns the FastAPI instance, lifespan, and router mounting.

    Usage (see __main__.py): `App(cfg)()` returns a built FastAPI app.
    """

    def __init__(self, config: AppConfig) -> None:
        self._config = config

    def __call__(self) -> FastAPI:
        """Builds the FastAPI app: middleware stack (request logging
        outermost, then CSRF) and every router mounted."""
        app = FastAPI(title="melpino backend", lifespan=self._lifespan)
        app.middleware("http")(self._csrf_middleware)
        # Registered AFTER _csrf_middleware -- Starlette's http middleware
        # wraps in reverse registration order, so this one ends up
        # OUTERMOST and the request id is already set (via the contextvar
        # in logging/request_context.py) by the time the CSRF check itself
        # runs and might log something.
        app.middleware("http")(self._request_logging_middleware)
        self._mount_routers(app)
        return app

    async def _request_logging_middleware(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """One JSON access line per request (method, path, status,
        duration_ms, request_id) regardless of which router handled it --
        the request id also ties this line to any error logged deeper in
        the call stack. See docs/design/01's App class section."""
        request_id = request.headers.get("X-Request-Id") or new_request_id()
        set_request_id(request_id)
        start = time.monotonic()
        try:
            response = await call_next(request)
        except Exception as exc:
            # Caught HERE, not via app.add_exception_handler(Exception,
            # ...) -- Starlette's BaseHTTPMiddleware (what app.middleware
            # ("http") uses under the hood) never delivers an exception
            # raised past call_next to a handler registered that way.
            # Anything reaching here is a genuine bug: every EXPECTED
            # domain error already becomes a real HTTPException upstream
            # via api/errors.py::to_http_exception.
            duration_ms = round((time.monotonic() - start) * 1000, 2)
            _log.error(
                "unhandled exception",
                exc_info=exc,
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": duration_ms,
                    "request_id": request_id,
                },
            )
            response = JSONResponse(
                status_code=500, content={"detail": "internal server error"}
            )
        duration_ms = round((time.monotonic() - start) * 1000, 2)
        response.headers["X-Request-Id"] = request_id
        level = _access_log.warning if response.status_code >= 500 else _access_log.info
        level(
            "request complete",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
                "request_id": request_id,
            },
        )
        return response

    async def _csrf_middleware(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """Session-bound double-submit CSRF check for every non-exempt
        mutating request -- see docs/design/02-auth-and-security.md.
        Deferred imports to avoid an import cycle with auth/db modules."""
        from melpino_backend.auth.csrf import _SAFE_METHODS, verify_csrf
        from melpino_backend.auth.sessions import SESSION_COOKIE_NAME, validate_session

        path = request.url.path
        # Boundary-matched (not bare startswith) so a prefix like
        # "/api/webhooks" exempts "/api/webhooks/..." only, never a
        # lookalike path that happens to share the same string prefix.
        is_exempt_prefix = any(
            path == prefix or path.startswith(prefix + "/")
            for prefix in _CSRF_EXEMPT_PREFIXES
        )
        if path not in _CSRF_EXEMPT_PATHS and not is_exempt_prefix:
            expected_secret: str | None = None
            session_token = request.cookies.get(SESSION_COOKIE_NAME)
            if session_token and request.method not in _SAFE_METHODS:
                import melpino_backend.db.base as db_base

                if db_base._sessionmaker is not None:
                    # All session-bound work (validate, verify_csrf, commit
                    # the idle-timeout slide) happens INSIDE this `async
                    # with` block, but call_next (which may run slow
                    # downstream I/O) runs AFTER the block exits, so this
                    # pooled connection is released before that I/O begins.
                    early_response: JSONResponse | None = None
                    async with db_base._sessionmaker() as csrf_db:
                        result = await validate_session(csrf_db, session_token)
                        if result.is_ok:
                            request.state.session_info = result.danger_ok
                            expected_secret = result.danger_ok.csrf_secret
                            # Don't commit the idle-timeout slide until
                            # verify_csrf below actually passes -- a
                            # CSRF-failed request must not count as
                            # legitimate session activity.
                            try:
                                verify_csrf(request, expected_secret)
                            except HTTPException as exc:
                                await csrf_db.rollback()
                                early_response = JSONResponse(
                                    status_code=exc.status_code,
                                    content={"detail": exc.detail},
                                )
                            else:
                                await csrf_db.commit()
                        else:
                            early_response = JSONResponse(
                                status_code=401,
                                content={"detail": result.danger_err.value},
                            )
                    if early_response is not None:
                        return early_response
                    if expected_secret is not None:
                        return await call_next(request)
            try:
                verify_csrf(request, expected_secret)
            except HTTPException as exc:
                return JSONResponse(
                    status_code=exc.status_code, content={"detail": exc.detail}
                )
        return await call_next(request)

    def _mount_routers(self, app: FastAPI) -> None:
        """Mounts every api/ router -- deferred imports so constructing an
        App for a unit test never pulls in domain/db modules unnecessarily."""
        from melpino_backend.api import (
            admin_logs,
            admin_metrics,
            admin_schedule,
            admin_students,
            auth,
            bookings,
            calendar,
            config_public,
            courses,
            health,
            invoices,
            invoices_public,
            waivers,
            webhooks,
        )

        app.include_router(health.router)
        app.include_router(config_public.router)
        app.include_router(auth.router)
        app.include_router(courses.router)
        app.include_router(bookings.router)
        app.include_router(invoices.router)
        app.include_router(invoices.sessions_router)
        app.include_router(invoices_public.router)
        app.include_router(webhooks.router)
        app.include_router(admin_schedule.router)
        app.include_router(admin_students.router)
        app.include_router(admin_metrics.router)
        app.include_router(admin_logs.router)
        app.include_router(calendar.router)
        app.include_router(calendar.admin_router)
        app.include_router(waivers.router)

    @asynccontextmanager
    async def _lifespan(self, _app: FastAPI) -> AsyncIterator[None]:
        """Initializes the DB engine, optionally seeds an admin, disposes on
        shutdown."""
        from melpino_backend.db.base import dispose_engine, init_engine

        # FINDINGS.md M1: session_secret signs pay-by-link and unsubscribe
        # tokens (derive_pay_token, sign_unsubscribe_token). Its default is
        # a hard-coded, source-visible constant -- fine for local dev/CI
        # (AppConfig is deliberately constructed with it in many test
        # fixtures), but refuse to boot if this looks like a real
        # deployment (public_base_url no longer a localhost/dev/placeholder
        # value) with that default still in place. Mirrors the webhook
        # path's existing fail-closed check on the "whsec_fake" constant.
        if (
            self._config.has_insecure_session_secret()
            and self._config.looks_like_real_deployment()
        ):
            _log.error(
                "refusing to start: SESSION_SECRET is unset (still the "
                "insecure dev default) while public_base_url=%s looks like "
                "a real deployment",
                self._config.public_base_url,
            )
            raise RuntimeError(
                "SESSION_SECRET must be set to a real secret before "
                "starting with a non-dev public_base_url"
            )

        _log.info("starting up: initializing database engine")
        init_engine(self._config.database_url)
        await self._seed_admin_if_configured()
        try:
            yield
        finally:
            _log.info("shutting down: disposing database engine")
            await dispose_engine()

    async def _seed_admin_if_configured(self) -> None:
        """Opt-in admin seed via SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD --
        see AppConfig's own doc comment. A real production deployment has
        no reason to keep either env var set past its very first
        bootstrap, so this is a no-op there; used by the test/dev compose
        stacks to guarantee a known admin fixture exists."""
        email = self._config.seed_admin_email
        password = self._config.seed_admin_password
        if not email or not password:
            _log.debug("admin seed skipped: SEED_ADMIN_EMAIL/PASSWORD not set")
            return

        import melpino_backend.db.base as db_base
        from melpino_backend.domain.auth.service import ensure_admin_seeded

        assert db_base._sessionmaker is not None  # init_engine() just ran above
        async with db_base._sessionmaker() as session:
            await ensure_admin_seeded(session, email, password)
            await session.commit()
        _log.info("admin seed step complete", extra={"email": email})
