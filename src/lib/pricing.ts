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
