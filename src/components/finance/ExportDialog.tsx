import { useEffect, useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { tbl, type LedgerEntryRow, type ExpenseEntryRow } from "@/lib/finance/db";
import { monthOrder } from "@/lib/finance/dates";
import { INCOME_COLUMNS, EXPENSE_COLUMNS } from "@/lib/finance/export-columns";
import {
  filterByPeriod,
  buildSheetData,
  exportToXlsx,
  periodLabel,
  defaultIncomeSelection,
  type Period,
} from "@/lib/finance/export";
import { formatEur } from "@/lib/finance/format";

type Dataset = "income" | "expense" | "both";
type Mode = Period["mode"];

const LS = {
  income: "caz.export.income.cols",
  expense: "caz.export.expense.cols",
  mode: "caz.export.period.mode",
};

function readKeys(storageKey: string, fallback: string[]): string[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function defaultKeys(columns: { key: string; defaultOn: boolean }[]): string[] {
  return columns.filter((c) => c.defaultOn).map((c) => c.key);
}

function currentMonthLabel(): string {
  return new Date().toLocaleDateString("es-ES", { month: "long" }).toUpperCase();
}

/** Compact date label for a transaction row (UTC to match the export date logic). */
function fmtTxDate(entryDate: string | null, month: string | null): string {
  if (entryDate)
    return new Date(entryDate + "T00:00:00Z").toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });
  if (month) return month.slice(0, 3).toLowerCase();
  return "—";
}

type TxRow = {
  id: string;
  entry_date: string | null;
  month: string | null;
  amount_cents: number | null;
  method: string | null;
};

/** Per-transaction checkbox list with a live selected-total / percentage indicator. */
function TransactionPicker<R extends TxRow>({
  rows,
  selected,
  onChange,
  describe,
  showPct,
}: {
  rows: R[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
  describe: (r: R) => string;
  showPct?: boolean;
}) {
  const totalCents = rows.reduce((a, r) => a + (r.amount_cents ?? 0), 0);
  const selCents = rows.reduce((a, r) => a + (selected.has(r.id) ? (r.amount_cents ?? 0) : 0), 0);
  const pct = totalCents > 0 ? Math.round((selCents / totalCents) * 100) : 0;

  const setAll = (on: boolean) => onChange(on ? new Set(rows.map((r) => r.id)) : new Set());
  const toggleId = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Seleccionado <span className="font-medium text-foreground">{formatEur(selCents)}</span> /{" "}
          {formatEur(totalCents)}
          {showPct && totalCents > 0 && (
            <span className={pct > 80 ? "text-warning" : ""}> · {pct}%</span>
          )}{" "}
          ({selected.size}/{rows.length})
        </p>
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setAll(true)}
          >
            Todos
          </button>
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setAll(false)}
          >
            Ninguno
          </button>
        </div>
      </div>
      <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border p-1.5">
        {rows.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            Sin transacciones en el periodo.
          </p>
        ) : (
          rows.map((r) => (
            <label
              key={r.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent"
            >
              <input
                type="checkbox"
                className="accent-primary"
                checked={selected.has(r.id)}
                onChange={() => toggleId(r.id)}
              />
              <span className="w-10 shrink-0 text-xs text-muted-foreground">
                {fmtTxDate(r.entry_date, r.month)}
              </span>
              <span className="min-w-0 flex-1 truncate">{describe(r)}</span>
              {r.method && (
                <span className="shrink-0 rounded border px-1 text-[10px] text-muted-foreground">
                  {r.method}
                </span>
              )}
              <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
                {r.amount_cents != null ? formatEur(r.amount_cents) : "—"}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export function ExportDialog({
  open,
  onOpenChange,
  defaultDataset = "both",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDataset?: Dataset;
}) {
  const [incomeRows, setIncomeRows] = useState<LedgerEntryRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseEntryRow[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [doIncome, setDoIncome] = useState(defaultDataset !== "expense");
  const [doExpense, setDoExpense] = useState(defaultDataset !== "income");

  const [mode, setMode] = useState<Mode>(
    () => (readKeys(LS.mode, ["month"])[0] as Mode) ?? "month",
  );
  const [monthSel, setMonthSel] = useState("");
  const [yearSel, setYearSel] = useState(() => new Date().getFullYear());
  const [quarterSel, setQuarterSel] = useState<1 | 2 | 3 | 4>(
    () => (Math.floor(new Date().getMonth() / 3) + 1) as 1 | 2 | 3 | 4,
  );
  const [customFrom, setCustomFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [incomeCols, setIncomeCols] = useState<Set<string>>(
    () => new Set(readKeys(LS.income, defaultKeys(INCOME_COLUMNS))),
  );
  const [expenseCols, setExpenseCols] = useState<Set<string>>(
    () => new Set(readKeys(LS.expense, defaultKeys(EXPENSE_COLUMNS))),
  );

  // Per-transaction selection (recomputed to defaults whenever the period/data changes).
  const [selectedIncomeIds, setSelectedIncomeIds] = useState<Set<string>>(new Set());
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());

  // Reset dataset selection to the entry point each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setDoIncome(defaultDataset !== "expense");
    setDoExpense(defaultDataset !== "income");
  }, [open, defaultDataset]);

  // Load raw rows when the dialog opens (independent of any page state).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setDataLoading(true);
      const [inc, exp] = await Promise.all([
        tbl("ledger_entries").select(
          "id, entry_date, month, student_name, item, category, amount_cents, method, status, notes, collector, commission_pct_override, created_at",
        ),
        tbl("expense_entries").select(
          "id, entry_date, month, category, provider, concept, amount_cents, method, notes, vat_cents, created_at",
        ),
      ]);
      if (cancelled) return;
      if (inc.error || exp.error) {
        toast.error("No se pudieron cargar los datos", {
          description: (inc.error ?? exp.error)?.message,
        });
      }
      setIncomeRows((inc.data ?? []) as LedgerEntryRow[]);
      setExpenseRows((exp.data ?? []) as ExpenseEntryRow[]);
      setDataLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Persist column choices and period mode.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LS.income, JSON.stringify([...incomeCols]));
    window.localStorage.setItem(LS.expense, JSON.stringify([...expenseCols]));
    window.localStorage.setItem(LS.mode, JSON.stringify([mode]));
  }, [incomeCols, expenseCols, mode]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of incomeRows) if (r.month) set.add(r.month);
    for (const r of expenseRows) if (r.month) set.add(r.month);
    return Array.from(set).sort((a, b) => monthOrder(a) - monthOrder(b) || a.localeCompare(b));
  }, [incomeRows, expenseRows]);

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    for (const r of incomeRows) if (r.entry_date) set.add(Number(r.entry_date.slice(0, 4)));
    for (const r of expenseRows) if (r.entry_date) set.add(Number(r.entry_date.slice(0, 4)));
    if (set.size === 0) set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [incomeRows, expenseRows]);

  // Initialise month/year selects once data is available.
  useEffect(() => {
    if (monthOptions.length && !monthSel) {
      const cur = currentMonthLabel();
      setMonthSel(monthOptions.includes(cur) ? cur : monthOptions[monthOptions.length - 1]);
    }
  }, [monthOptions, monthSel]);
  useEffect(() => {
    setYearSel((y) => (yearOptions.includes(y) ? y : yearOptions[0]));
  }, [yearOptions]);

  const period: Period = useMemo(() => {
    switch (mode) {
      case "all":
        return { mode: "all" };
      case "month":
        return { mode: "month", month: monthSel };
      case "quarter":
        return { mode: "quarter", year: yearSel, quarter: quarterSel };
      case "year":
        return { mode: "year", year: yearSel };
      case "custom":
        return { mode: "custom", from: customFrom, to: customTo };
    }
  }, [mode, monthSel, yearSel, quarterSel, customFrom, customTo]);

  const incomePreview = useMemo(() => filterByPeriod(incomeRows, period), [incomeRows, period]);
  const expensePreview = useMemo(() => filterByPeriod(expenseRows, period), [expenseRows, period]);
  const approximate =
    (doIncome ? incomePreview.approximate : 0) + (doExpense ? expensePreview.approximate : 0);

  // Default selection: income excludes cash (efectivo); expenses include everything.
  // Re-runs only when the filtered set changes (period/data), not on manual toggles.
  useEffect(() => {
    setSelectedIncomeIds(new Set(defaultIncomeSelection(incomePreview.rows)));
  }, [incomePreview]);
  useEffect(() => {
    setSelectedExpenseIds(new Set(expensePreview.rows.map((r) => r.id)));
  }, [expensePreview]);

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const noDataset = !doIncome && !doExpense;
  const noColumns = (doIncome && incomeCols.size === 0) || (doExpense && expenseCols.size === 0);
  const canExport = !exporting && !dataLoading && !noDataset && !noColumns;

  async function handleExport() {
    setExporting(true);
    const label = periodLabel(period);
    try {
      let files = 0;
      if (doIncome) {
        const rows = incomePreview.rows.filter((r) => selectedIncomeIds.has(r.id));
        if (rows.length === 0) {
          toast.warning("Ingresos: ninguna transacción seleccionada");
        } else {
          await exportToXlsx({
            sheetName: "Ingresos",
            fileName: `Ingresos_${label}.xlsx`,
            sheet: buildSheetData(rows, INCOME_COLUMNS, [...incomeCols]),
          });
          files++;
        }
      }
      if (doExpense) {
        const rows = expensePreview.rows.filter((r) => selectedExpenseIds.has(r.id));
        if (rows.length === 0) {
          toast.warning("Gastos: ninguna transacción seleccionada");
        } else {
          await exportToXlsx({
            sheetName: "Gastos",
            fileName: `Gastos_${label}.xlsx`,
            sheet: buildSheetData(rows, EXPENSE_COLUMNS, [...expenseCols]),
          });
          files++;
        }
      }
      if (files > 0) {
        toast.success(`Exportado · ${files} archivo${files > 1 ? "s" : ""}`);
        onOpenChange(false);
      }
    } catch (e) {
      toast.error("Error al exportar", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exportar para el Gestor</DialogTitle>
          <DialogDescription>
            Genera un Excel de ingresos y/o gastos por periodo. Elige las columnas que necesita tu
            gestor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Datasets */}
          <div className="space-y-2">
            <Label>Datos a exportar</Label>
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={doIncome}
                  onChange={(e) => setDoIncome(e.target.checked)}
                />
                Ingresos
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={doExpense}
                  onChange={(e) => setDoExpense(e.target.checked)}
                />
                Gastos
              </label>
            </div>
          </div>

          {/* Period */}
          <div className="space-y-2">
            <Label>Periodo</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Mes</SelectItem>
                  <SelectItem value="quarter">Trimestre</SelectItem>
                  <SelectItem value="year">Año</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                  <SelectItem value="all">Todo</SelectItem>
                </SelectContent>
              </Select>

              {mode === "month" && (
                <Select value={monthSel} onValueChange={setMonthSel}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Mes…" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {(mode === "quarter" || mode === "year") && (
                <Select value={String(yearSel)} onValueChange={(v) => setYearSel(Number(v))}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {mode === "quarter" && (
                <Select
                  value={String(quarterSel)}
                  onValueChange={(v) => setQuarterSel(Number(v) as 1 | 2 | 3 | 4)}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Q1</SelectItem>
                    <SelectItem value="2">Q2</SelectItem>
                    <SelectItem value="3">Q3</SelectItem>
                    <SelectItem value="4">Q4</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {mode === "custom" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-40"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-40"
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {dataLoading
                ? "Cargando datos…"
                : `${doIncome ? `${incomePreview.rows.length} ingresos` : ""}${
                    doIncome && doExpense ? " · " : ""
                  }${doExpense ? `${expensePreview.rows.length} gastos` : ""} en el periodo`}
              {approximate > 0 && (
                <span className="text-warning">
                  {" "}
                  · {approximate} sin fecha exacta (incluidas por mes)
                </span>
              )}
            </p>
          </div>

          {/* Transactions */}
          {!dataLoading && (doIncome || doExpense) && (
            <div className="space-y-4">
              {doIncome && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground">
                    Transacciones · Ingresos
                  </Label>
                  <TransactionPicker
                    rows={incomePreview.rows}
                    selected={selectedIncomeIds}
                    onChange={setSelectedIncomeIds}
                    showPct
                    describe={(r) => `${r.student_name ?? "—"}${r.item ? " · " + r.item : ""}`}
                  />
                </div>
              )}
              {doExpense && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground">
                    Transacciones · Gastos
                  </Label>
                  <TransactionPicker
                    rows={expensePreview.rows}
                    selected={selectedExpenseIds}
                    onChange={setSelectedExpenseIds}
                    describe={(r) => r.concept ?? r.provider ?? r.category ?? "—"}
                  />
                </div>
              )}
            </div>
          )}

          {/* Columns */}
          <div className="grid gap-5 sm:grid-cols-2">
            {doIncome && (
              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground">
                  Columnas · Ingresos
                </Label>
                <div className="space-y-1.5">
                  {INCOME_COLUMNS.map((c) => (
                    <label key={c.key} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={incomeCols.has(c.key)}
                        onChange={() => toggle(incomeCols, c.key, setIncomeCols)}
                      />
                      {c.header}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {doExpense && (
              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground">Columnas · Gastos</Label>
                <div className="space-y-1.5">
                  {EXPENSE_COLUMNS.map((c) => (
                    <label key={c.key} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={expenseCols.has(c.key)}
                        onChange={() => toggle(expenseCols, c.key, setExpenseCols)}
                      />
                      {c.header}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={!canExport} className="gap-2">
            <FileDown className="h-4 w-4" />
            {exporting ? "Exportando…" : "Exportar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
