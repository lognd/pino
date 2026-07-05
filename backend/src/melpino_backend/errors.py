from __future__ import annotations

# Single home for every ErrorSet definition in this backend -- see
# docs/design/01-backend-architecture.md's ErrorSet inventory. CRIB:
# logand.app backend/src/logand_backend/errors.py for the pattern (typani
# ErrorSet subclasses, string-valued variants); melpino's variant list is
# its own, per doc 01/02/03/04/05/06.
from typani.error_set import ErrorSet


class AuthError(ErrorSet):
    """Admin login/session failures -- see docs/design/02-auth-and-security.md."""

    InvalidCredentials = "email or password is incorrect"
    SessionExpired = "session has expired and must be re-authenticated"
    SessionNotFound = "session token does not match any known session"
    PasswordInvalidLength = "password must be between 8 and 128 characters"


class BookingError(ErrorSet):
    """Guest booking lifecycle/capacity/token failures -- see
    docs/design/04-booking-and-scheduling.md and 02-auth-and-security.md."""

    SessionNotFound = "class session was not found"
    SessionFull = "this session is full -- join the waitlist instead"
    SessionNotBookable = "this session is not open for booking"
    DuplicateBooking = "this email already has a confirmed booking for this session"
    NotFound = "booking was not found"
    # Never distinguishes "wrong token" from "expired token" -- see
    # docs/design/02: lookup failures must never confirm a booking exists
    # to someone guessing tokens.
    TokenInvalid = "this booking link is invalid or has expired"
    AlreadyCancelled = "this booking has already been cancelled"
    CancellationWindowClosed = (
        "it is too close to the session start time to cancel online -- please call"
    )
    PartySizeInvalid = "party size must be a positive integer"
    AttestationRequired = "the eligibility attestation must be accepted to book"


class CourseError(ErrorSet):
    """Course catalog / admin scheduling failures -- see
    docs/design/03-database.md and 04-booking-and-scheduling.md."""

    NotFound = "course was not found"
    SessionOverlap = "this session overlaps another session at the same time"
    CapacityBelowBooked = (
        "requested capacity is below the number of seats already booked"
    )
    InvalidState = "session is not in a state that allows this transition"


class StudentError(ErrorSet):
    """Student roster failures -- see docs/design/03-database.md."""

    NotFound = "student was not found"


class InvoiceError(ErrorSet):
    """Invoice lifecycle failures -- see docs/design/05-payments-and-invoicing.md
    (this doc changes InvoiceError.NotOwned's semantics to "pay-token
    scoped" rather than logand's customer-account scoping, since melpino
    has no customer accounts)."""

    NotFound = "invoice was not found"
    NotOwned = "invoice does not belong to the requesting pay-token"
    InvalidState = "invoice is not in a state that allows this operation"
    AmountMismatch = "client-supplied amount does not match server-computed total"
    PaymentPending = "a payment is still being reviewed for this invoice; please wait"


class RefundError(ErrorSet):
    """Refund failures -- copied verbatim from logand.app's variant list
    per docs/design/05-payments-and-invoicing.md ("copy logand's variants/
    status codes verbatim"). CRIB: logand.app
    backend/src/logand_backend/errors.py::RefundError."""

    PaymentNotFound = "payment was not found on this invoice"
    PaymentNotRefundable = "payment is not in a state that can be refunded"
    AmountExceedsBalance = "refund amount exceeds the payment's remaining balance"
    InvalidAmount = "refund amount must be greater than zero"
    ProviderReferenceMissing = (
        "payment method requires a provider reference to refund and none is on file"
    )
    RecordingFailed = (
        "refund may have executed with the provider but could not be recorded; "
        "investigate before retrying"
    )
    PriorAttemptFailed = (
        "a prior refund attempt with this request id failed and no money was "
        "refunded; retry with a new request id"
    )


class WaiverError(ErrorSet):
    """Waiver upload/lookup failures -- see docs/design/06-waivers-and-legal.md."""

    NotFound = "waiver was not found"
    StudentNotFound = "the student this waiver would attach to was not found"
    UnsupportedContentType = "waiver file type is not one of the allowed formats"


class PaymentProviderError(ErrorSet):
    """Stripe/PayPal provider-level failures -- identical semantics to
    logand.app's PaymentProviderError (a real, expected "not configured
    yet" state vs. a real provider-side failure)."""

    NotConfigured = "this payment provider is not configured"
    RequestFailed = "the payment provider rejected or failed to process the request"
