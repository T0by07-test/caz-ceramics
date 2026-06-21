export function formatEur(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    (cents ?? 0) / 100,
  );
}

/** "21" (whole %) <-> 0.21 (decimal) helpers for the settings UI. */
export function pctToInput(decimal: number | null | undefined): string {
  if (decimal == null) return "";
  return String(Math.round(decimal * 1000) / 10); // 0.215 -> 21.5
}

export function inputToPct(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (Number.isNaN(n)) return null;
  return Math.round((n / 100) * 10000) / 10000; // 21.5 -> 0.215
}
