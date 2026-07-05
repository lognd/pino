// Admin calendar-sync surface -- the composed ICS subscribe URL (backend:
// api/calendar.py's staff-authed feed-url endpoint). Null while the
// server has no CALENDAR_FEED_KEY configured.

import { apiGet } from "./client";

export interface CalendarFeedUrl {
  feed_url: string | null;
}

export function fetchCalendarFeedUrl(): Promise<CalendarFeedUrl> {
  return apiGet<CalendarFeedUrl>("/api/admin/calendar/feed-url");
}
