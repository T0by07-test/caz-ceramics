export const FIRING_SIZES = [
  { key: "extra_small", label: "Extra pequeña", cents: 150 },
  { key: "small", label: "Pequeña", cents: 350 },
  { key: "medium", label: "Mediana", cents: 500 },
  { key: "large", label: "Grande", cents: 700 },
  { key: "extra_large", label: "Extra grande", cents: 1100 },
] as const;

export type FiringSize = (typeof FIRING_SIZES)[number]["key"];
export type FiringQuantities = Record<FiringSize, number>;
export const emptyFiringQuantities = (): FiringQuantities => ({ extra_small: 0, small: 0, medium: 0, large: 0, extra_large: 0 });
export function firingTotals(quantities: FiringQuantities) {
  let pieces = 0;
  let cents = 0;
  for (const size of FIRING_SIZES) {
    const quantity = quantities[size.key];
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 10000) throw new Error("Invalid piece quantity");
    pieces += quantity;
    cents += quantity * size.cents;
  }
  return { pieces, cents };
}