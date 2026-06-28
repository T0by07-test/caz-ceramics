import { monthLabelToIndex } from "./dates";

/** Period selection for the Gestor export. */
export type Period =
  | { mode: "all" }
  | { mode: "month"; month: string } // Spanish month label, e.g. "JUNIO"
  | { mode: "quarter"; year: number; quarter: 1 | 2 | 3 | 4 }
  | { mode: "year"; year: number }
  | { mode: "custom"; from: string; to: string }; // ISO yyyy-mm-dd, inclusive

type DatedRow = { entry_date: string | null; month: string | null };

function dateMonthIndex(entryDate: string): number {
  return Number(entryDate.slice(5, 7)) - 1;
}
function dateYear(entryDate: string): number {
  return Number(entryDate.slice(0, 4));
}

/** Derived month index (0-11): entry_date wins, month label is the fallback. */
function rowMonthIndex(row: DatedRow): number | null {
  if (row.entry_date) return dateMonthIndex(row.entry_date);
  return monthLabelToIndex(row.month);
}

/** True if `monthIndex` lies within the months spanned by an ISO range (year-agnostic). */
function monthInCustomRange(monthIndex: number, from: string, to: string): boolean {
  const fromM = dateMonthIndex(from);
  const toM = dateMonthIndex(to);
  const span = (dateYear(to) - dateYear(from)) * 12 + (toM - fromM);
  if (span >= 11) return true; // range covers a full year or more
  if (fromM <= toM) return monthIndex >= fromM && monthIndex <= toM;
  return monthIndex >= fromM || monthIndex <= toM; // wraps across year boundary
}

export type PeriodResult<Row> = {
  rows: Row[];
  /** Undated (month-only) rows included in a year-sensitive period — their year is unknown. */
  approximate: number;
};

/**
 * Filters rows by period. Rows with an `entry_date` are matched exactly; rows that
 * only carry a `month` label are matched by month and, for year-sensitive periods
 * (quarter/year/custom), reported via `approximate` since their year is unknown.
 */
export function filterByPeriod<Row extends DatedRow>(
  rows: Row[],
  period: Period,
): PeriodResult<Row> {
  if (period.mode === "all") return { rows: [...rows], approximate: 0 };

  if (period.mode === "month") {
    const target = monthLabelToIndex(period.month);
    return { rows: rows.filter((r) => rowMonthIndex(r) === target), approximate: 0 };
  }

  const out: Row[] = [];
  let approximate = 0;
  for (const r of rows) {
    let keep = false;
    if (r.entry_date) {
      const mi = dateMonthIndex(r.entry_date);
      const yr = dateYear(r.entry_date);
      if (period.mode === "year") keep = yr === period.year;
      else if (period.mode === "quarter")
        keep = yr === period.year && Math.floor(mi / 3) + 1 === period.quarter;
      else keep = r.entry_date >= period.from && r.entry_date <= period.to;
    } else {
      const mi = monthLabelToIndex(r.month);
      if (mi != null) {
        if (period.mode === "year") keep = true;
        else if (period.mode === "quarter") keep = Math.floor(mi / 3) + 1 === period.quarter;
        else keep = monthInCustomRange(mi, period.from, period.to);
      }
      if (keep) approximate++;
    }
    if (keep) out.push(r);
  }
  return { rows: out, approximate };
}

/** A column shape that the renderer needs (subset of ExportColumn, no value getter). */
type RenderColumn = { header: string; width?: number; type: "text" | "number" | "date" };

export type SheetData = {
  headers: string[];
  rows: (string | number | Date | null)[][];
  columns: RenderColumn[];
};

type ValueColumn<Row> = RenderColumn & {
  key: string;
  value: (r: Row) => string | number | Date | null;
};

/**
 * Maps rows to a flat sheet using the selected columns. Output column order follows
 * `allColumns` (the canonical definition order), not the `selectedKeys` argument order.
 */
export function buildSheetData<Row>(
  rows: Row[],
  allColumns: ValueColumn<Row>[],
  selectedKeys: string[],
): SheetData {
  const sel = new Set(selectedKeys);
  const columns = allColumns.filter((c) => sel.has(c.key));
  return {
    headers: columns.map((c) => c.header),
    rows: rows.map((r) => columns.map((c) => c.value(r))),
    columns: columns.map(({ header, width, type }) => ({ header, width, type })),
  };
}

/** Payment-method code for cash. */
export const CASH_METHOD = "E";

/**
 * Default per-transaction income selection for the Gestor export: every row except
 * cash (efectivo). Cazu excludes cash and declares ~80%, then fine-tunes individual
 * transactions manually. Expenses default to all rows selected (handled by the caller).
 */
export function defaultIncomeSelection<Row extends { id: string; method: string | null }>(
  rows: Row[],
): string[] {
  return rows.filter((r) => r.method !== CASH_METHOD).map((r) => r.id);
}

/** Short label for filenames, e.g. "2026-Q2", "junio", "2026", "todo". */
export function periodLabel(period: Period): string {
  switch (period.mode) {
    case "all":
      return "todo";
    case "month":
      return period.month.toLowerCase();
    case "quarter":
      return `${period.year}-Q${period.quarter}`;
    case "year":
      return String(period.year);
    case "custom":
      return `${period.from}_${period.to}`;
  }
}

/**
 * Builds a styled .xlsx from a single sheet and triggers a browser download.
 * `exceljs` is loaded lazily so it stays out of the main bundle. Throws on failure;
 * the caller is responsible for surfacing errors to the user.
 */
export async function exportToXlsx(opts: {
  sheetName: string;
  fileName: string;
  sheet: SheetData;
}): Promise<void> {
  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const { headers, rows, columns } = opts.sheet;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheetName);
  ws.columns = columns.map((c, i) => ({
    header: headers[i],
    key: String(i),
    width: c.width ?? 14,
  }));

  ws.getRow(1).font = { bold: true };

  for (const r of rows) ws.addRow(r);

  columns.forEach((c, idx) => {
    const col = ws.getColumn(idx + 1);
    if (c.type === "number") col.numFmt = c.header.includes("€") ? "#,##0.00 €" : "0.0";
    else if (c.type === "date") col.numFmt = "dd/mm/yyyy";
  });

  // Totals row for euro columns
  const euroCols = columns
    .map((c, idx) => ({ c, idx }))
    .filter(({ c }) => c.type === "number" && c.header.includes("€"));
  if (rows.length > 0 && euroCols.length > 0) {
    const totals: (string | number | null)[] = columns.map(() => null);
    totals[0] = "TOTAL";
    for (const { idx } of euroCols) {
      const sum = rows.reduce(
        (acc, row) => acc + (typeof row[idx] === "number" ? (row[idx] as number) : 0),
        0,
      );
      totals[idx] = Math.round(sum * 100) / 100;
    }
    ws.addRow(totals).font = { bold: true };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
