// Pure month-grid math for the admin calendar widget -- DOM-free and
// unit-tested. Weeks run Sunday-first (US audience, doc 00).

export interface CalendarDay {
  /** ISO date (YYYY-MM-DD) in LOCAL time -- the bucketing key. */
  iso: string;
  dayOfMonth: number;
  /** False for the leading/trailing days padding the first/last week. */
  inMonth: boolean;
  isToday: boolean;
}

/** Local-time YYYY-MM-DD for a Date (the grid buckets by Mel's wall
 * clock, not UTC -- an evening class must not land on tomorrow's cell). */
export function localIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The full week rows (Sunday-first) covering `year`/`month` (0-based
 * month), padded with the neighbouring months' days. Always 4-6 rows of
 * exactly 7 days. `today` is injectable for deterministic tests. */
export function monthGrid(year: number, month: number, today = new Date()): CalendarDay[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const todayIso = localIsoDate(today);
  const weeks: CalendarDay[][] = [];
  const cursor = new Date(start);
  // Walk whole weeks until the month is fully covered.
  do {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({
        iso: localIsoDate(cursor),
        dayOfMonth: cursor.getDate(),
        inMonth: cursor.getMonth() === month,
        isToday: localIsoDate(cursor) === todayIso,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getMonth() === month);
  return weeks;
}

/** Month title like "July 2026" without locale surprises in tests. */
export function monthTitle(year: number, month: number): string {
  const NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${NAMES[month]} ${year}`;
}

/** Group items by their local calendar day. `startsAt` must be an ISO
 * datetime string; invalid dates are dropped rather than mis-bucketed. */
export function bucketByDay<T>(
  items: readonly T[],
  startsAt: (item: T) => string,
): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const date = new Date(startsAt(item));
    if (Number.isNaN(date.getTime())) continue;
    const key = localIsoDate(date);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(item);
    else byDay.set(key, [item]);
  }
  return byDay;
}
