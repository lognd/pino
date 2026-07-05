from __future__ import annotations

# Unit coverage for the pure iCalendar builder (domain/calendar/ics.py) --
# escaping, folding, UTC formatting, document structure, and the Google
# Calendar link. The feed/booking endpoints are thin wrappers over this.
from datetime import datetime, timezone

import pytest

from melpino_backend.domain.calendar.ics import (
    IcsEvent,
    build_calendar,
    escape_text,
    fold_line,
    format_utc,
    google_calendar_link,
)

_START = datetime(2026, 8, 1, 14, 0, tzinfo=timezone.utc)
_END = datetime(2026, 8, 1, 16, 30, tzinfo=timezone.utc)
_NOW = datetime(2026, 7, 5, 12, 0, tzinfo=timezone.utc)


def _event(**overrides: object) -> IcsEvent:
    fields: dict = {
        "uid": "session-abc@melpino",
        "summary": "Concealed Carry Certification",
        "starts_at": _START,
        "ends_at": _END,
        "description": "3/8 seats booked",
        "location": "Range Bay 1, 100 Main St",
    }
    fields.update(overrides)
    return IcsEvent(**fields)


def test_escape_text_escapes_all_rfc5545_specials() -> None:
    assert escape_text("a;b,c\nd\\e") == "a\\;b\\,c\\nd\\\\e"
    # Backslash first: an escaped semicolon must not double-escape.
    assert escape_text("\\;") == "\\\\\\;"


def test_fold_line_folds_over_75_octets_with_leading_space() -> None:
    line = "DESCRIPTION:" + "x" * 200
    folded = fold_line(line)
    for part in folded.split("\r\n")[1:]:
        assert part.startswith(" ")
    for part in folded.split("\r\n"):
        assert len(part.encode("utf-8")) <= 75
    # Unfolding reproduces the original exactly.
    assert folded.replace("\r\n ", "") == line


def test_fold_line_leaves_short_lines_alone() -> None:
    assert fold_line("SUMMARY:short") == "SUMMARY:short"


def test_format_utc_converts_and_refuses_naive() -> None:
    assert format_utc(_START) == "20260801T140000Z"
    with pytest.raises(ValueError):
        format_utc(datetime(2026, 8, 1, 14, 0))


def test_build_calendar_document_structure() -> None:
    body = build_calendar([_event()], calendar_name="Mel Pino classes", now=_NOW)
    assert body.startswith("BEGIN:VCALENDAR\r\n")
    assert body.endswith("END:VCALENDAR\r\n")
    assert "VERSION:2.0" in body
    assert "METHOD:PUBLISH" in body
    assert "X-WR-CALNAME:Mel Pino classes" in body
    assert "UID:session-abc@melpino" in body
    assert "DTSTART:20260801T140000Z" in body
    assert "DTEND:20260801T163000Z" in body
    assert "DTSTAMP:20260705T120000Z" in body
    assert "SUMMARY:Concealed Carry Certification" in body
    assert "LOCATION:Range Bay 1\\, 100 Main St" in body
    # Every line is CRLF-terminated and folded within 75 octets.
    for line in body.split("\r\n"):
        assert len(line.encode("utf-8")) <= 75


def test_build_calendar_is_deterministic_given_now() -> None:
    a = build_calendar([_event()], calendar_name="C", now=_NOW)
    b = build_calendar([_event()], calendar_name="C", now=_NOW)
    assert a == b


def test_google_calendar_link_prefills_the_event() -> None:
    url = google_calendar_link(_event())
    assert url.startswith("https://calendar.google.com/calendar/render?")
    assert "action=TEMPLATE" in url
    assert "dates=20260801T140000Z%2F20260801T163000Z" in url
    assert "Concealed%20Carry%20Certification" in url
