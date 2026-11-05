/** Utilidades de búsqueda para los listados de finanzas.
 *
 * Los nombres reales llevan tildes y mayúsculas ("María Soneira"), así que una
 * comparación literal hace que escribir "maria" no encuentre nada. Todo lo que
 * se busca pasa por `normalizeForSearch` para comparar sin acentos ni mayúsculas.
 */

/** Minúsculas, sin acentos y con los espacios colapsados. */
export function normalizeForSearch(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿`value` contiene `query` sin distinguir acentos ni mayúsculas?
 * Una búsqueda vacía coincide con todo (no filtra). */
export function matchesSearch(
  value: string | null | undefined,
  query: string | null | undefined,
): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return normalizeForSearch(value).includes(q);
}

/** ¿Alguno de los campos coincide con la búsqueda? */
export function matchesAnySearch(
  values: (string | null | undefined)[],
  query: string | null | undefined,
): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return values.some((v) => normalizeForSearch(v).includes(q));
}
