/**
 * Spanish month-label helpers, shared by the ledger views and the Gestor export.
 * Labels are stored free-form (e.g. "JUNIO") so lookups are case-insensitive and
 * tolerate the common "setiembre" spelling variant.
 */
export const MONTH_INDEX: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

/** Spanish month names indexed 0-11, used for filenames and period labels. */
export const MONTH_NAMES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Sort key for a month label (0-11), 99 for unknown labels. */
export function monthOrder(month: string): number {
  return MONTH_INDEX[month.trim().toLowerCase()] ?? 99;
}

/** Month index (0-11) for a label, or null if unrecognised / empty. */
export function monthLabelToIndex(label: string | null | undefined): number | null {
  if (!label) return null;
  const i = MONTH_INDEX[label.trim().toLowerCase()];
  return i === undefined ? null : i;
}
