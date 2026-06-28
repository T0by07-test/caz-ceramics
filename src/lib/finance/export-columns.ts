import type { LedgerEntryRow, ExpenseEntryRow } from "./db";

/** Declarative column definition for the Gestor export. */
export type ExportColumn<Row> = {
  /** Stable key — used for the column picker and localStorage persistence. */
  key: string;
  /** Spanish header written to the Excel sheet. */
  header: string;
  /** Column width hint (Excel character units). */
  width?: number;
  type: "text" | "number" | "date";
  /** Extracts the cell value from a row. Numbers are euros, dates are JS Date. */
  value: (r: Row) => string | number | Date | null;
  /** Whether the column is selected by default. */
  defaultOn: boolean;
};

const METHOD_LABELS: Record<string, string> = {
  T: "Tarjeta",
  E: "Efectivo",
  B: "Bizum",
  R: "Revolut",
};

function expandMethod(method: string | null): string | null {
  if (!method) return null;
  return METHOD_LABELS[method] ?? method;
}

/**
 * entry_date ("yyyy-mm-dd") → Date at UTC midnight, or null.
 * exceljs serialises dates via getTime() (UTC), so a UTC-midnight Date renders the
 * correct calendar day in Excel regardless of the exporter's timezone. Local
 * midnight would shift a day back in UTC+ zones (e.g. Europe/Madrid).
 */
function toDate(entryDate: string | null): Date | null {
  return entryDate ? new Date(entryDate + "T00:00:00Z") : null;
}

/** Integer cents → euros as a real number (2 decimals), or null. */
function toEuros(cents: number | null): number | null {
  if (cents == null) return null;
  return Math.round(cents) / 100;
}

export const INCOME_COLUMNS: ExportColumn<LedgerEntryRow>[] = [
  {
    key: "fecha",
    header: "Fecha",
    width: 12,
    type: "date",
    defaultOn: true,
    value: (r) => toDate(r.entry_date),
  },
  { key: "mes", header: "Mes", width: 12, type: "text", defaultOn: true, value: (r) => r.month },
  {
    key: "alumno",
    header: "Alumno",
    width: 22,
    type: "text",
    defaultOn: true,
    value: (r) => r.student_name,
  },
  {
    key: "item",
    header: "Clase / Producto",
    width: 22,
    type: "text",
    defaultOn: true,
    value: (r) => r.item,
  },
  {
    key: "categoria",
    header: "Categoría",
    width: 16,
    type: "text",
    defaultOn: true,
    value: (r) => r.category,
  },
  {
    key: "importe",
    header: "Importe (€)",
    width: 12,
    type: "number",
    defaultOn: true,
    value: (r) => toEuros(r.amount_cents),
  },
  {
    key: "metodo",
    header: "Método",
    width: 12,
    type: "text",
    defaultOn: true,
    value: (r) => expandMethod(r.method),
  },
  {
    key: "estado",
    header: "Estado",
    width: 12,
    type: "text",
    defaultOn: true,
    value: (r) => r.status,
  },
  {
    key: "profesoras",
    header: "Profesora(s)",
    width: 18,
    type: "text",
    defaultOn: false,
    value: (r) => (r.collector && r.collector.length ? r.collector.join(", ") : null),
  },
  {
    key: "comision",
    header: "Comisión %",
    width: 12,
    type: "number",
    defaultOn: false,
    value: (r) =>
      r.commission_pct_override == null ? null : Math.round(r.commission_pct_override * 1000) / 10,
  },
  {
    key: "notas",
    header: "Notas",
    width: 30,
    type: "text",
    defaultOn: false,
    value: (r) => r.notes,
  },
];

export const EXPENSE_COLUMNS: ExportColumn<ExpenseEntryRow>[] = [
  {
    key: "fecha",
    header: "Fecha",
    width: 12,
    type: "date",
    defaultOn: true,
    value: (r) => toDate(r.entry_date),
  },
  { key: "mes", header: "Mes", width: 12, type: "text", defaultOn: true, value: (r) => r.month },
  {
    key: "categoria",
    header: "Categoría",
    width: 16,
    type: "text",
    defaultOn: true,
    value: (r) => r.category,
  },
  {
    key: "proveedor",
    header: "Proveedor",
    width: 20,
    type: "text",
    defaultOn: true,
    value: (r) => r.provider,
  },
  {
    key: "concepto",
    header: "Concepto",
    width: 24,
    type: "text",
    defaultOn: true,
    value: (r) => r.concept,
  },
  {
    key: "importe",
    header: "Importe (€)",
    width: 12,
    type: "number",
    defaultOn: true,
    value: (r) => toEuros(r.amount_cents),
  },
  {
    key: "iva",
    header: "IVA soportado (€)",
    width: 16,
    type: "number",
    defaultOn: true,
    value: (r) => toEuros(r.vat_cents),
  },
  {
    key: "base",
    header: "Base imponible (€)",
    width: 16,
    type: "number",
    defaultOn: false,
    value: (r) => (r.amount_cents == null ? null : toEuros(r.amount_cents - (r.vat_cents ?? 0))),
  },
  {
    key: "metodo",
    header: "Método",
    width: 12,
    type: "text",
    defaultOn: true,
    value: (r) => expandMethod(r.method),
  },
  {
    key: "notas",
    header: "Notas",
    width: 30,
    type: "text",
    defaultOn: false,
    value: (r) => r.notes,
  },
];
