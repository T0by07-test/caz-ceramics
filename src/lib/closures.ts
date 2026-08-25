/**
 * Studio closures: date ranges (inclusive, ISO YYYY-MM-DD) with no classes.
 * Classes inside these ranges are hidden from students and cannot be selected.
 */
export const STUDIO_CLOSURES: { startIso: string; endIso: string; label: string }[] = [
  { startIso: "2026-09-29", endIso: "2026-10-04", label: "Cerrado del 29/09 al 04/10" },
];

export function studioClosureFor(dateIso: string) {
  return STUDIO_CLOSURES.find((c) => dateIso >= c.startIso && dateIso <= c.endIso) ?? null;
}

export function isStudioClosed(dateIso: string): boolean {
  return studioClosureFor(dateIso) !== null;
}

/** Filters out any item scheduled on a closed date. */
export function withoutClosedDates<T extends { date: string }>(items: T[]): T[] {
  return items.filter((i) => !isStudioClosed(i.date));
}
