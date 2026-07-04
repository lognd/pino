from __future__ import annotations

# Maps every ErrorSet variant to an HTTP status; fails fast at import
# time if any variant is unmapped. CRIB: logand.app
# backend/src/logand_backend/api/errors.py -- pattern copied verbatim
# (machine-readable `code` field alongside human-readable `detail`),
# status numbers per docs/design/01-backend-architecture.md's ErrorSet
# inventory.
from fastapi import HTTPException
from typani.error_set import ErrorSet

from melpino_backend.errors import (
    AuthError,
    BookingError,
    CourseError,
    InvoiceError,
    PaymentProviderError,
    RefundError,
    StudentError,
    WaiverError,
)

_STATUS_MAP: dict[ErrorSet, int] = {
    AuthError.InvalidCredentials: 401,
    AuthError.SessionExpired: 401,
    AuthError.SessionNotFound: 401,
    AuthError.PasswordInvalidLength: 422,
    BookingError.SessionNotFound: 404,
    BookingError.SessionFull: 409,
    BookingError.SessionNotBookable: 409,
    BookingError.DuplicateBooking: 409,
    BookingError.NotFound: 404,
    # 404, never a distinct "expired" status -- see docs/design/02: a
    # guessed/wrong/expired manage token must never confirm a booking
    # exists at all.
    BookingError.TokenInvalid: 404,
    BookingError.AlreadyCancelled: 409,
    BookingError.CancellationWindowClosed: 409,
    BookingError.PartySizeInvalid: 422,
    BookingError.AttestationRequired: 422,
    CourseError.NotFound: 404,
    CourseError.SessionOverlap: 409,
    CourseError.CapacityBelowBooked: 422,
    StudentError.NotFound: 404,
    InvoiceError.NotFound: 404,
    InvoiceError.NotOwned: 404,  # NOTE: 404 not 403 -- never confirm existence
    InvoiceError.InvalidState: 409,
    InvoiceError.AmountMismatch: 422,
    InvoiceError.PaymentPending: 409,
    RefundError.PaymentNotFound: 404,
    RefundError.PaymentNotRefundable: 409,
    RefundError.AmountExceedsBalance: 422,
    RefundError.InvalidAmount: 422,
    RefundError.ProviderReferenceMissing: 409,
    RefundError.RecordingFailed: 500,
    RefundError.PriorAttemptFailed: 409,
    WaiverError.NotFound: 404,
    WaiverError.StudentNotFound: 404,
    WaiverError.UnsupportedContentType: 422,
    # 503 (not 500) -- "not configured yet" is an expected, temporary
    # deployment state; the frontend uses this to show Zelle/in-person
    # instead of a generic error banner.
    PaymentProviderError.NotConfigured: 503,
    # 502 -- the provider itself is the thing that failed, not this server.
    PaymentProviderError.RequestFailed: 502,
}


def _verify_complete_mapping() -> None:
    """Fails at import time (not at request time) if any ErrorSet variant
    declared in errors.py has no entry above -- see
    docs/design/01-backend-architecture.md's layering rule."""
    for error_set_cls in (
        AuthError,
        BookingError,
        CourseError,
        StudentError,
        InvoiceError,
        RefundError,
        WaiverError,
        PaymentProviderError,
    ):
        for variant in error_set_cls:
            if variant not in _STATUS_MAP:
                raise NotImplementedError(
                    f"{error_set_cls.__name__}.{variant.name} has no HTTP "
                    "status mapping in api/errors.py"
                )


_verify_complete_mapping()


def to_http_exception(err: ErrorSet) -> HTTPException:
    """Converts a domain ErrorSet variant to an HTTPException whose body
    carries both a human-readable `detail` and a stable, machine-readable
    `code` ("BookingError.SessionFull") the frontend branches on instead
    of matching prose. CRIB: logand.app
    backend/src/logand_backend/api/errors.py::to_http_exception."""
    return HTTPException(
        status_code=_STATUS_MAP[err],
        detail={"detail": err.value, "code": f"{type(err).__name__}.{err.name}"},
    )
