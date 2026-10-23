/**
 * Monthly pricing for class selections.
 *
 * Adults: 1 clase 30 € · 2 clases 55 € · 3 clases 70 € · 4 clases 85 €.
 * Each extra adult class beyond the 4th costs 20 €.
 * A single trial class costs 35 €.
 * Kids classes (lunes 17:00, 1 h) cost 12 € each and are priced per class.
 */
export const TIER_PRICES_CENTS = [0, 3000, 5500, 7000, 8500] as const;
export const EXTRA_CLASS_PRICE_CENTS = 2000;
export const TRIAL_PRICE_CENTS = 3500;
export const KIDS_CLASS_PRICE_CENTS = 1200;

export function monthlyPriceCents(count: number): number {
  if (count <= 0) return 0;
  if (count <= 4) return TIER_PRICES_CENTS[count];
  return TIER_PRICES_CENTS[4] + (count - 4) * EXTRA_CLASS_PRICE_CENTS;
}

/**
 * Price a mixed selection: adult classes use the monthly tiers, kids classes
 * are charged individually at 12 €.
 */
export function selectionPriceCents(items: { audience?: string | null }[]): number {
  const kids = items.filter((i) => i.audience === "kids").length;
  const adults = items.length - kids;
  return monthlyPriceCents(adults) + kids * KIDS_CLASS_PRICE_CENTS;
}

/** "85 €" / "97,50 €" */
export function formatEuros(cents: number): string {
  const value = cents / 100;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2).replace(".", ",")} €`;
}

/**
 * Price a selection where the student brings companions (+1 / +2): each guest
 * occupies a seat and is charged exactly like the student's own seat.
 */
export function selectionPriceCentsWithGuests(
  items: { audience?: string | null }[],
  guests: number,
): number {
  const per = 1 + Math.max(0, guests);
  return selectionPriceCents(items.flatMap((i) => Array.from({ length: per }, () => i)));
}

export function groupSelectionByMonth<T extends { date: string }>(items: T[]): { month: string; classes: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const month = item.date.slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), item]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([month, classes]) => ({ month, classes }));
}

export function monthlySelectionBreakdown<T extends { date: string; audience?: string | null }>(items: T[], guests: number) {
  return groupSelectionByMonth(items).map(({ month, classes }) => ({
    month,
    count: classes.length,
    cents: selectionPriceCentsWithGuests(classes, guests),
  }));
}

export function formatPriceMonth(month: string): string {
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" })
    .format(new Date(`${month}-01T12:00:00Z`));
}
