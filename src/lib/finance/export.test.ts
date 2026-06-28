import { describe, it, expect } from "vitest";
import { filterByPeriod, buildSheetData, type Period } from "./export";
import { INCOME_COLUMNS, EXPENSE_COLUMNS } from "./export-columns";
import type { LedgerEntryRow, ExpenseEntryRow } from "./db";

const ledgerBase: LedgerEntryRow = {
  id: "x",
  entry_date: null,
  month: null,
  student_name: null,
  item: null,
  category: null,
  amount_cents: null,
  method: null,
  status: null,
  notes: null,
  collector: null,
  commission_pct_override: null,
  created_at: "2026-01-01T00:00:00Z",
};
function L(p: Partial<LedgerEntryRow>): LedgerEntryRow {
  return { ...ledgerBase, ...p };
}

const expenseBase: ExpenseEntryRow = {
  id: "y",
  entry_date: null,
  month: null,
  category: null,
  provider: null,
  concept: null,
  amount_cents: null,
  method: null,
  notes: null,
  vat_cents: null,
  created_at: "2026-01-01T00:00:00Z",
};
function E(p: Partial<ExpenseEntryRow>): ExpenseEntryRow {
  return { ...expenseBase, ...p };
}

describe("filterByPeriod", () => {
  const rows = [
    L({ id: "jan", entry_date: "2026-01-15", month: "ENERO" }),
    L({ id: "apr", entry_date: "2026-04-10", month: "ABRIL" }),
    L({ id: "jun", entry_date: "2026-06-20", month: "JUNIO" }),
    L({ id: "jun-prev", entry_date: "2025-06-05", month: "JUNIO" }),
    L({ id: "jun-nodate", entry_date: null, month: "JUNIO" }),
    L({ id: "none", entry_date: null, month: null }),
  ];

  it("mode 'all' returns every row, nothing approximate", () => {
    const r = filterByPeriod(rows, { mode: "all" });
    expect(r.rows.map((x) => x.id).sort()).toEqual(
      ["apr", "jan", "jun", "jun-nodate", "jun-prev", "none"].sort(),
    );
    expect(r.approximate).toBe(0);
  });

  it("mode 'month' matches by month regardless of year, label fallback for no-date rows", () => {
    const r = filterByPeriod(rows, { mode: "month", month: "JUNIO" });
    expect(r.rows.map((x) => x.id).sort()).toEqual(["jun", "jun-nodate", "jun-prev"].sort());
    // month mode is not year-sensitive → month-only rows are exact, not approximate
    expect(r.approximate).toBe(0);
  });

  it("mode 'year' filters dated rows by year and flags undated rows as approximate", () => {
    const r = filterByPeriod(rows, { mode: "year", year: 2026 });
    // dated 2026 rows: jan, apr, jun  + undated month rows kept as approximate: jun-nodate
    expect(r.rows.map((x) => x.id).sort()).toEqual(["apr", "jan", "jun", "jun-nodate"].sort());
    expect(r.rows.find((x) => x.id === "jun-prev")).toBeUndefined();
    expect(r.approximate).toBe(1); // jun-nodate has no entry_date
  });

  it("mode 'quarter' keeps only months of that quarter and year", () => {
    const r = filterByPeriod(rows, { mode: "quarter", year: 2026, quarter: 2 });
    // Q2 = Apr-Jun. Dated 2026: apr, jun. Undated June: jun-nodate (approximate). jun-prev excluded (2025).
    expect(r.rows.map((x) => x.id).sort()).toEqual(["apr", "jun", "jun-nodate"].sort());
    expect(r.approximate).toBe(1);
  });

  it("mode 'custom' filters dated rows by ISO range inclusive", () => {
    const r = filterByPeriod(rows, {
      mode: "custom",
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(r.rows.map((x) => x.id).sort()).toEqual(["jun", "jun-nodate"].sort());
    expect(r.approximate).toBe(1);
  });
});

describe("buildSheetData", () => {
  it("emits selected income columns in definition order with mapped values", () => {
    const rows = [L({ student_name: "Ana", amount_cents: 8000, method: "T", status: "Pagado" })];
    const sheet = buildSheetData(rows, INCOME_COLUMNS, ["metodo", "alumno", "importe"]);
    // order follows INCOME_COLUMNS, not the selectedKeys argument order
    expect(sheet.headers).toEqual(["Alumno", "Importe (€)", "Método"]);
    expect(sheet.rows).toEqual([["Ana", 80, "Tarjeta"]]);
  });

  it("exports amounts as euro numbers (not strings) for summing in Excel", () => {
    const rows = [L({ amount_cents: 12345 })];
    const sheet = buildSheetData(rows, INCOME_COLUMNS, ["importe"]);
    expect(sheet.rows[0][0]).toBe(123.45);
    expect(typeof sheet.rows[0][0]).toBe("number");
  });

  it("derives expense 'Base imponible' as amount minus VAT", () => {
    const rows = [E({ amount_cents: 3630, vat_cents: 630 })];
    const sheet = buildSheetData(rows, EXPENSE_COLUMNS, ["importe", "iva", "base"]);
    expect(sheet.headers).toEqual(["Importe (€)", "IVA soportado (€)", "Base imponible (€)"]);
    expect(sheet.rows).toEqual([[36.3, 6.3, 30]]);
  });

  it("joins multiple teachers and keeps null for empty optional fields", () => {
    const rows = [L({ collector: ["Sofi", "Martu"], notes: null })];
    const sheet = buildSheetData(rows, INCOME_COLUMNS, ["profesoras", "notas"]);
    expect(sheet.rows).toEqual([["Sofi, Martu", null]]);
  });
});
