// Pure helpers for the /book flow's step machine and seat-count copy --
// kept dependency-free (no React) so step navigation and the "N of M
// seats open" plain-words template are directly unit-testable without
// mounting Book.tsx. See docs/design/04-booking-and-scheduling.md's
// "Frontend booking flow" contract (exactly 3 steps + a confirmation
// screen, linear, no step may be skipped).

import { CONTENT } from "../content/mock";

export type BookStep = "pick" | "details" | "confirm" | "confirmed";

const ORDER: readonly BookStep[] = ["pick", "details", "confirm", "confirmed"];

/** The next step in the linear flow -- "confirmed" has no successor
 * (it is a terminal screen, not a step you can advance past). */
export function nextStep(current: BookStep): BookStep {
  const index = ORDER.indexOf(current);
  if (index === -1 || index === ORDER.length - 1) return current;
  return ORDER[index + 1];
}

/** The previous step -- "pick" has no predecessor, and "confirmed" never
 * goes backwards (a completed booking cannot be un-confirmed by hitting
 * Back; the manage page is where you cancel it). */
export function prevStep(current: BookStep): BookStep {
  if (current === "confirmed") return current;
  const index = ORDER.indexOf(current);
  if (index <= 0) return current;
  return ORDER[index - 1];
}

/** 1-based step number for the "Step N of 3" label -- "confirmed" still
 * reports 3 (it renders after step 3's action, not as a 4th step). */
export function stepNumber(current: BookStep): 1 | 2 | 3 {
  if (current === "pick") return 1;
  if (current === "details") return 2;
  return 3;
}

/** "4 of 10 seats open" -- the plain-words phrasing doc 04 requires
 * instead of a bare number. Template lives in content/mock.ts so all
 * booking copy stays in one file. */
export function formatSeatsOpen(seatsOpen: number, capacity: number): string {
  return CONTENT.booking.seatsOpenTemplate
    .replace("{open}", String(seatsOpen))
    .replace("{capacity}", String(capacity));
}
