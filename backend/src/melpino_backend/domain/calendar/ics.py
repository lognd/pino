from __future__ import annotations

# Pure iCalendar (RFC 5545) generation -- no DB, no HTTP, unit-testable.
# The output is what Google Calendar (and Apple/Outlook) subscribe to via
# "Other calendars > From URL", so it sticks to the conservative core of
# the spec: CRLF line endings, 75-octet line folding, TEXT escaping, UTC
# basic-format timestamps, METHOD:PUBLISH + X-WR-CALNAME for a named
# subscribed calendar.
from dataclasses import dataclass
from datetime import datetime, timezone

PRODID = "-//Mel Pino//melpino backend//EN"


@dataclass(frozen=True)
class IcsEvent:
    """One VEVENT: a class session (or a single guest's booked class)."""

    uid: str
    summary: str
    starts_at: datetime
    ends_at: datetime
    description: str = ""
    location: str = ""
    url: str = ""


def escape_text(value: str) -> str:
    """RFC 5545 TEXT escaping: backslash, semicolon, comma, and newlines.
    Backslash first, or it would double-escape the others' escapes."""
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def fold_line(line: str) -> str:
    """RFC 5545 3.1 line folding: content lines longer than 75 octets are
    split with CRLF + one leading space. Folds on UTF-8 BYTE length without
    ever splitting inside a multi-byte character."""
    encoded = line.encode("utf-8")
    if len(encoded) <= 75:
        return line
    parts: list[str] = []
    current = b""
    # First segment gets 75 octets; continuations get 74 (the leading
    # space costs one).
    limit = 75
    for ch in line:
        b = ch.encode("utf-8")
        if len(current) + len(b) > limit:
            parts.append(current.decode("utf-8"))
            current = b
            limit = 74
        else:
            current += b
    parts.append(current.decode("utf-8"))
    return "\r\n ".join(parts)


def format_utc(dt: datetime) -> str:
    """UTC basic format (YYYYMMDDTHHMMSSZ). Naive datetimes are refused --
    every stored timestamp is timezone-aware (DateTime(timezone=True))."""
    if dt.tzinfo is None:
        raise ValueError("ICS timestamps must be timezone-aware")
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _event_lines(event: IcsEvent, now: datetime) -> list[str]:
    lines = [
        "BEGIN:VEVENT",
        f"UID:{escape_text(event.uid)}",
        f"DTSTAMP:{format_utc(now)}",
        f"DTSTART:{format_utc(event.starts_at)}",
        f"DTEND:{format_utc(event.ends_at)}",
        f"SUMMARY:{escape_text(event.summary)}",
    ]
    if event.description:
        lines.append(f"DESCRIPTION:{escape_text(event.description)}")
    if event.location:
        lines.append(f"LOCATION:{escape_text(event.location)}")
    if event.url:
        lines.append(f"URL:{escape_text(event.url)}")
    lines.append("END:VEVENT")
    return lines


def build_calendar(
    events: list[IcsEvent], *, calendar_name: str, now: datetime | None = None
) -> str:
    """The full VCALENDAR document, CRLF-joined and folded. `now` is the
    DTSTAMP instant, injectable so tests are deterministic."""
    stamp = now if now is not None else datetime.now(timezone.utc)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape_text(calendar_name)}",
    ]
    for event in events:
        lines.extend(_event_lines(event, stamp))
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold_line(line) for line in lines) + "\r\n"


def google_calendar_link(event: IcsEvent) -> str:
    """A prefilled Google Calendar 'add this event' URL -- the one-click
    path for guests who live in Google Calendar (the ICS download covers
    everyone else)."""
    from urllib.parse import quote

    dates = f"{format_utc(event.starts_at)}/{format_utc(event.ends_at)}"
    params = [
        ("action", "TEMPLATE"),
        ("text", event.summary),
        ("dates", dates),
        ("details", event.description),
        ("location", event.location),
    ]
    query = "&".join(f"{k}={quote(v, safe='')}" for k, v in params if v)
    return f"https://calendar.google.com/calendar/render?{query}"
