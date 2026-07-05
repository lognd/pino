import { describe, expect, it } from "vitest";
import {
  bucketByDay,
  localIsoDate,
  monthGrid,
  monthTitle,
} from "../../src/lib/calendarGrid";

// Pure month-grid math backing the admin calendar widget.

describe("lib/calendarGrid monthGrid", () => {
  it("covers July 2026 with full Sunday-first weeks", () => {
    const weeks = monthGrid(2026, 6, new Date(2026, 6, 5));
    // July 2026 starts on a Wednesday and has 31 days -> 5 weeks.
    expect(weeks.length).toBe(5);
    for (const week of weeks) expect(week.length).toBe(7);
    // First cell pads back to Sunday June 28; last week ends August 1.
    expect(weeks[0][0].iso).toBe("2026-06-28");
    expect(weeks[0][0].inMonth).toBe(false);
    expect(weeks[0][3].iso).toBe("2026-07-01");
    expect(weeks[0][3].inMonth).toBe(true);
    expect(weeks[4][6].iso).toBe("2026-08-01");
    expect(weeks[4][6].inMonth).toBe(false);
  });

  it("marks exactly one today cell when today is in the month", () => {
    const weeks = monthGrid(2026, 6, new Date(2026, 6, 5));
    const todays = weeks.flat().filter((d) => d.isToday);
    expect(todays.length).toBe(1);
    expect(todays[0].iso).toBe("2026-07-05");
  });

  it("contains every day of the month exactly once", () => {
    const weeks = monthGrid(2026, 1, new Date(2026, 1, 1)); // Feb 2026
    const inMonth = weeks.flat().filter((d) => d.inMonth);
    expect(inMonth.length).toBe(28);
    expect(new Set(inMonth.map((d) => d.iso)).size).toBe(28);
  });

  it("titles months without locale surprises", () => {
    expect(monthTitle(2026, 6)).toBe("July 2026");
    expect(monthTitle(2027, 0)).toBe("January 2027");
  });
});

describe("lib/calendarGrid bucketByDay", () => {
  it("buckets items by LOCAL calendar day and drops invalid dates", () => {
    const items = [
      { id: "a", when: new Date(2026, 6, 10, 9, 0).toISOString() },
      { id: "b", when: new Date(2026, 6, 10, 18, 0).toISOString() },
      { id: "c", when: new Date(2026, 6, 11, 8, 0).toISOString() },
      { id: "bad", when: "not-a-date" },
    ];
    const byDay = bucketByDay(items, (i) => i.when);
    expect(byDay.get(localIsoDate(new Date(2026, 6, 10)))?.map((i) => i.id)).toEqual([
      "a",
      "b",
    ]);
    expect(byDay.get(localIsoDate(new Date(2026, 6, 11)))?.length).toBe(1);
    let total = 0;
    for (const bucket of byDay.values()) total += bucket.length;
    expect(total).toBe(3);
  });
});
