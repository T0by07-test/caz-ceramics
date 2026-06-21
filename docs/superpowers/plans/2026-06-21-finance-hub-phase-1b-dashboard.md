# Finance-Hub Phase 1b — Dashboard & Entry UI Implementation Plan

> **For agentic workers:** Execute with superpowers:executing-plans. UI tasks verify via the preview tools (no component test runner); pure helpers verify with Vitest. Steps use checkbox (`- [ ]`).

**Goal:** The in-app finance hub UI: a dashboard at `/admin/finanzas` (KPIs, charts, pendientes, commissions, monthly net table) reading the tested `computeFinanceMonthly`, plus a Gastos CRUD page, a settings editor (tax params + commission rates), the Registro form extended for `collector` + per-class commission override, and grouped finance navigation.

**Architecture:** A single data hook `useFinanceData()` loads the RLS-protected rows (`ledger_entries`, `expense_entries`, `finance_settings`, `commission_rates`) and runs them through `src/lib/finance/compute.ts`. Pages consume the hook. UI follows existing patterns from `admin.index.tsx` / `admin.registro.tsx` (shadcn + design tokens `text-h1`, `shadow-card`, `text-success`, `text-warning`). Charts use `recharts` (already installed).

**Tech Stack:** React 19, TanStack Router, recharts, shadcn/ui, Supabase JS.

**Depends on:** Phase 1a (migration + import) applied in Lovable Cloud — preview verification needs the tables live.

**Spec:** `docs/superpowers/specs/2026-06-21-finance-hub-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/finance/format.ts` (create) | `formatEur(cents)` shared formatter |
| `src/lib/finance/db.ts` (create) | Typed Supabase reads/writes for the finance tables (cast-helper like `admin.registro.tsx`) |
| `src/lib/finance/useFinanceData.ts` (create) | Hook: load rows + `computeFinanceMonthly` + `sumMonthly` |
| `src/routes/admin.finanzas.tsx` (create) | Dashboard page (KPIs, charts, pendientes, comisiones, table) + settings sheet |
| `src/routes/admin.gastos.tsx` (create) | Gastos CRUD (mirrors `admin.registro.tsx`) |
| `src/routes/admin.registro.tsx` (modify) | Add `collector` multi-select + `commission_pct_override`; fix duplicate `R` SelectItem |
| `src/routes/admin.tsx` (modify) | Nav: add Finanzas + Gastos |
| `src/components/finance/MultiTeacherSelect.tsx` (create) | Reusable collector multi-select (Popover + Checkboxes) |

---

## Task 1: Shared formatter + finance DB access

**Files:** Create `src/lib/finance/format.ts`, `src/lib/finance/db.ts`

- [ ] **Step 1: `format.ts`**

```ts
export function formatEur(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    (cents ?? 0) / 100,
  );
}
```

- [ ] **Step 2: `db.ts` — typed table access**

`ledger_entries` and the finance tables are not in the generated Supabase types, so wrap `supabase.from` with permissive casts (same approach as `admin.registro.tsx`).

```ts
import { supabase } from "@/integrations/supabase/client";
import type { LedgerRow, ExpenseRow, FinanceSettings, CommissionRate } from "./types";

export type LedgerEntryRow = LedgerRow & {
  id: string;
  entry_date: string | null;
  student_name: string | null;
  item: string | null;
  created_at: string;
};
export type ExpenseEntryRow = ExpenseRow & {
  id: string;
  entry_date: string | null;
  category: string | null;
  provider: string | null;
  concept: string | null;
  method: string | null;
  notes: string | null;
  created_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (name: string) => (supabase.from as any)(name);

export async function loadFinanceRows() {
  const [ledger, expenses, settings, rates] = await Promise.all([
    tbl("ledger_entries").select(
      "id, entry_date, month, student_name, item, category, amount_cents, method, status, notes, collector, commission_pct_override, created_at",
    ),
    tbl("expense_entries").select(
      "id, entry_date, month, category, provider, concept, amount_cents, method, notes, vat_cents, created_at",
    ),
    tbl("finance_settings").select("*").limit(1).maybeSingle(),
    tbl("commission_rates").select("*").order("teacher"),
  ]);
  return {
    ledger: (ledger.data ?? []) as LedgerEntryRow[],
    expenses: (expenses.data ?? []) as ExpenseEntryRow[],
    settings: (settings.data ?? null) as (FinanceSettings & { id: number }) | null,
    rates: (rates.data ?? []) as (CommissionRate & { active: boolean })[],
    error: ledger.error || expenses.error || settings.error || rates.error || null,
  };
}

export const DEFAULT_SETTINGS: FinanceSettings = {
  iva_rate: 0.21, irpf_rate: 0.15, declared_pct: 0.8, fee_revolut_pct: 0, fee_bizum_pct: 0,
};
```

- [ ] **Step 3: type-check + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add src/lib/finance/format.ts src/lib/finance/db.ts
git commit -m "feat(finance): shared formatter + finance db access"
```

---

## Task 2: `useFinanceData` hook

**Files:** Create `src/lib/finance/useFinanceData.ts`

- [ ] **Step 1: Implement the hook**

```ts
import { useEffect, useState } from "react";
import { loadFinanceRows, DEFAULT_SETTINGS, type LedgerEntryRow, type ExpenseEntryRow } from "./db";
import { computeFinanceMonthly, sumMonthly, type FinanceTotals } from "./compute";
import type { MonthlyFinance, CommissionRate } from "./types";

export interface FinanceData {
  loading: boolean;
  error: string | null;
  ledger: LedgerEntryRow[];
  expenses: ExpenseEntryRow[];
  rates: (CommissionRate & { active: boolean })[];
  settings: typeof DEFAULT_SETTINGS & { id?: number };
  monthly: MonthlyFinance[];
  totals: FinanceTotals;
  reload: () => void;
}

export function useFinanceData(): FinanceData {
  const [state, setState] = useState<Omit<FinanceData, "reload">>({
    loading: true, error: null, ledger: [], expenses: [], rates: [],
    settings: DEFAULT_SETTINGS, monthly: [], totals: sumMonthly([]),
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { ledger, expenses, settings, rates, error } = await loadFinanceRows();
      if (cancelled) return;
      const effSettings = settings ?? DEFAULT_SETTINGS;
      const activeRates = rates.filter((r) => r.active);
      const monthly = computeFinanceMonthly(ledger, expenses, effSettings, activeRates);
      setState({
        loading: false,
        error: error ? error.message : null,
        ledger, expenses, rates,
        settings: effSettings,
        monthly,
        totals: sumMonthly(monthly),
      });
    })();
    return () => { cancelled = true; };
  }, [tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
```

- [ ] **Step 2: type-check + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add src/lib/finance/useFinanceData.ts
git commit -m "feat(finance): useFinanceData hook"
```

---

## Task 3: Dashboard page `/admin/finanzas`

**Files:** Create `src/routes/admin.finanzas.tsx`

Sections (per spec 5.1): KPI row (Facturado YTD, Beneficio neto YTD, Media neto/mes, Pendiente total), bar chart Facturado vs Neto (real months), Ingresos por categoría (current real month), Método donut (current real month), Pendientes list, Comisiones a pagar card, monthly net table. Use `recharts` `ResponsiveContainer`/`BarChart`/`PieChart`. Currency via `formatEur`. Loading via `Skeleton`, empty via `EmptyState`. Month label uppercase ES.

- [ ] **Step 1: Build the page** (full component — KPIs + charts + tables reading `useFinanceData`). Follow the KpiCard pattern from `admin.index.tsx`.
- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; then preview (needs 1a SQL applied): `preview_start`, snapshot `/admin/finanzas`, confirm KPIs + chart render with ene–may data, no console errors.
- [ ] **Step 3: Commit** `feat(finance): dashboard /admin/finanzas`.

---

## Task 4: Gastos CRUD `/admin/gastos`

**Files:** Create `src/routes/admin.gastos.tsx`

Mirror `admin.registro.tsx` structure (list + filters + Sheet form + delete) against `expense_entries`. Fields: entry_date, month, category, provider, concept, amount (€→cents), method (T/E/B/R), vat (IVA soportado, €→cents), notes. KPI: total gastos + total IVA soportado for the filtered range.

- [ ] **Step 1: Build the page.**
- [ ] **Step 2: Verify** — tsc clean; preview: create a test expense, confirm it appears, delete it.
- [ ] **Step 3: Commit** `feat(finance): gastos CRUD /admin/gastos`.

---

## Task 5: Commission multi-select + Registro extension

**Files:** Create `src/components/finance/MultiTeacherSelect.tsx`; modify `src/routes/admin.registro.tsx`

- [ ] **Step 1: `MultiTeacherSelect`** — Popover + Checkbox list of known teachers (`Cande`, `Sofi`, `Martu`) + free-text add; value `string[]`, onChange. Renders selected as comma chips.
- [ ] **Step 2: Extend the Registro form** — add `collector` (MultiTeacherSelect) and `commission_pct_override` (optional % input, stored as decimal e.g. 0.65) to the create/edit `LedgerFormSheet`; include both in the insert/update payload and the `LedgerEntry` type + select columns.
- [ ] **Step 3: Fix the duplicate `R` SelectItem** — `admin.registro.tsx` has two `<SelectItem value="R">` (lines ~656-657: `R · Revolut` and `R · ?`). Remove the `R · ?` one, keep `R · Revolut`.
- [ ] **Step 4: Verify** — tsc clean; preview: edit an entry, set collector `{Sofi}` + override, save, confirm persisted.
- [ ] **Step 5: Commit** `feat(finance): registro collector + commission override`.

---

## Task 6: Finance navigation

**Files:** Modify `src/routes/admin.tsx`

- [ ] **Step 1:** Add nav items: `Finanzas` → `/admin/finanzas` (icon `LayoutDashboard` or `PiggyBank`), `Gastos` → `/admin/gastos` (icon `Receipt`). Keep `Registro` (label can become `Ingresos`). Order: … Pagos, **Finanzas, Ingresos, Gastos**, Notificaciones.
- [ ] **Step 2: Verify** — preview: nav shows the new items, each routes correctly.
- [ ] **Step 3: Commit** `feat(finance): finance nav group`.

---

## Task 7: Settings editor (tax params + commission rates)

**Files:** Modify `src/routes/admin.finanzas.tsx` (add a settings Sheet)

- [ ] **Step 1:** A "Ajustes" button on the dashboard opens a Sheet editing `finance_settings` (iva_rate, irpf_rate, declared_pct, fee_revolut_pct, fee_bizum_pct — shown as %) and `commission_rates` (per-teacher default_pct). Percentages edited as whole numbers (e.g. 21) ↔ stored as decimals (0.21). On save: upsert `finance_settings` (id=1) and upsert each `commission_rates` row; then `reload()`.
- [ ] **Step 2: Verify** — tsc clean; preview: open Ajustes, change declared_pct, save, confirm the dashboard net recomputes.
- [ ] **Step 3: Commit** `feat(finance): finance settings + commission-rate editor`.

---

## Final verification

- [ ] `npx tsc --noEmit` clean.
- [ ] `npx vitest run` — compute tests still green.
- [ ] Preview walkthrough (after 1a SQL applied): `/admin/finanzas` shows real ene–may data, charts, commissions; `/admin/gastos` CRUD works; Registro collector+override persists; settings recompute net.
- [ ] Then superpowers:finishing-a-development-branch.

## Self-Review

- **Spec 5.1 dashboard sections** → Task 3. ✅
- **Gastos UI (4.2 / 5.2)** → Task 4. ✅
- **collector + override (4.1 / 4.5)** → Task 5. ✅
- **Nav (8)** → Task 6. ✅
- **Settings: tax + commission rates (5.3)** → Task 7. ✅
- **Type consistency:** `useFinanceData`, `loadFinanceRows`, `formatEur`, `MonthlyFinance`, `FinanceTotals` reused from 1a module; no redefinitions.
- **Note:** preview verification depends on 1a SQL being applied in Lovable Cloud; tsc/vitest are provable offline.
