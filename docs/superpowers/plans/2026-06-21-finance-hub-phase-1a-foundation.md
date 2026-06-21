# Finance-Hub Phase 1a — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data + computation foundation of the finance hub: new tables (RLS admin-only), `ledger_entries` extensions for teacher commissions, a fully unit-tested pure TypeScript computation module that reproduces the Excel's Resumen + Beneficio Neto + commission logic, and a one-time import of the real historical data.

**Architecture:** New finance tables live in `public` with `is_admin()` RLS — consistent with the existing `ledger_entries` (already read directly via PostgREST under RLS by `admin.registro.tsx`). All financial math lives in one pure module `src/lib/finance/compute.ts`, unit-tested with Vitest against hand-computed fixtures; the dashboard (1b) and later the chat (Phase 3) both consume it. DB migrations are applied manually in the Lovable SQL editor (Lovable Cloud does not auto-run migrations); the import SQL is generated from the Excel and kept out of the repo (PII).

**Tech Stack:** TanStack Start + React 19 + TypeScript, Supabase (Postgres + RLS), Vitest (new), Python (import generator, openpyxl).

**Spec:** `docs/superpowers/specs/2026-06-21-finance-hub-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.ts` (create) | Vitest config, node environment, `src/**/*.test.ts` |
| `package.json` (modify) | add `test` / `test:watch` scripts + vitest devDep |
| `src/lib/finance/types.ts` (create) | Shared types + `MONTHS` constant |
| `src/lib/finance/compute.ts` (create) | Pure computation: `computeMonth`, `computeFinanceMonthly`, `sumMonthly` |
| `src/lib/finance/compute.test.ts` (create) | Unit tests with hand-computed fixtures |
| `supabase/migrations/20260621120000_finance_foundation.sql` (create) | Schema: new tables + RLS + `ledger_entries` columns |
| `docs/setup/apply-finance-foundation.sql` (create) | Copy of the migration for the Lovable SQL editor |
| `/tmp/finance-import.sql` (generated, NOT in repo) | Data import (PII) |
| `scripts/gen-finance-import.py` (create) | Generator: Excel → import SQL |

---

## Task 1: Vitest setup

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Create: `src/lib/finance/sanity.test.ts` (temporary, deleted at end of task)

- [ ] **Step 1: Install Vitest**

Use the repo's package manager (bun — see `bun.lockb` / `bunfig.toml`):

Run: `bun add -d vitest`
Expected: `vitest` appears in `devDependencies`.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add test scripts to `package.json`**

In the `"scripts"` block add:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Write a sanity test**

Create `src/lib/finance/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npx vitest run`
Expected: PASS, 1 test passed.

- [ ] **Step 6: Delete the sanity test and commit**

```bash
rm src/lib/finance/sanity.test.ts
git add vitest.config.ts package.json bun.lockb
git commit -m "chore: add vitest"
```

---

## Task 2: Types + monthly aggregation (TDD)

**Files:**
- Create: `src/lib/finance/types.ts`
- Create: `src/lib/finance/compute.ts`
- Create: `src/lib/finance/compute.test.ts`

- [ ] **Step 1: Write the types**

Create `src/lib/finance/types.ts`:

```ts
export const MONTHS = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
] as const;
export type Month = (typeof MONTHS)[number];

export interface LedgerRow {
  month: string | null;
  category: string | null;
  amount_cents: number | null;
  method: string | null; // 'T' | 'E' | 'B' | 'R' | null
  status: string | null; // 'Pagado' | 'Pendiente' | 'ausente' | null
  collector: string[] | null;
  commission_pct_override: number | null;
}

export interface ExpenseRow {
  month: string | null;
  amount_cents: number | null;
  vat_cents: number | null;
}

export interface FinanceSettings {
  iva_rate: number; // 0.21
  irpf_rate: number; // 0.15
  declared_pct: number; // 0.80
  fee_revolut_pct: number; // applied to method 'T'
  fee_bizum_pct: number; // applied to method 'B'
}

export interface CommissionRate {
  teacher: string;
  default_pct: number;
}

export interface MonthlyFinance {
  month: string;
  facturado: number; // cents, status Pagado
  pendiente: number; // cents, status Pendiente
  n_pagos: number;
  gastos: number; // cents
  iva_soportado: number; // cents
  declarado: number; // cents
  efectivo_exento: number; // cents
  comision_cobro: number; // cents (payment-processor fees)
  comisiones_profesores: number; // cents (teacher payouts)
  comisiones_por_profesor: Record<string, number>; // teacher -> cents
  iva_a_pagar: number; // cents
  irpf: number; // cents
  beneficio_neto: number; // cents
  beneficio_simple: number; // cents (facturado - gastos)
}
```

- [ ] **Step 2: Write the failing aggregation test**

Create `src/lib/finance/compute.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeMonth } from "./compute";
import type { LedgerRow, ExpenseRow, FinanceSettings } from "./types";

const SETTINGS: FinanceSettings = {
  iva_rate: 0.21,
  irpf_rate: 0.15,
  declared_pct: 0.8,
  fee_revolut_pct: 0,
  fee_bizum_pct: 0,
};

const TAX_LEDGER: LedgerRow[] = [
  { month: "TEST", category: "Adulto", amount_cents: 10000, method: "T", status: "Pagado", collector: null, commission_pct_override: null },
  { month: "TEST", category: "Adulto", amount_cents: 5000, method: "E", status: "Pagado", collector: null, commission_pct_override: null },
  { month: "TEST", category: "Adulto", amount_cents: 8000, method: "B", status: "Pendiente", collector: null, commission_pct_override: null },
  { month: "OTRO", category: "Adulto", amount_cents: 9999, method: "E", status: "Pagado", collector: null, commission_pct_override: null },
];
const TAX_EXPENSES: ExpenseRow[] = [
  { month: "TEST", amount_cents: 3000, vat_cents: 630 },
  { month: "OTRO", amount_cents: 1000, vat_cents: 0 },
];

describe("computeMonth — aggregation", () => {
  it("aggregates only the requested month", () => {
    const m = computeMonth("TEST", TAX_LEDGER, TAX_EXPENSES, SETTINGS, []);
    expect(m.facturado).toBe(15000);
    expect(m.pendiente).toBe(8000);
    expect(m.n_pagos).toBe(2);
    expect(m.gastos).toBe(3000);
    expect(m.iva_soportado).toBe(630);
  });
});
```

- [ ] **Step 3: Run it — verify it fails**

Run: `npx vitest run src/lib/finance/compute.test.ts`
Expected: FAIL — `computeMonth` is not exported / not defined.

- [ ] **Step 4: Implement aggregation in `compute.ts`**

Create `src/lib/finance/compute.ts`:

```ts
import {
  MONTHS,
  type LedgerRow,
  type ExpenseRow,
  type FinanceSettings,
  type CommissionRate,
  type MonthlyFinance,
} from "./types";

const OWNER = "Cande";

function sum(xs: (number | null | undefined)[]): number {
  return xs.reduce<number>((s, x) => s + (x ?? 0), 0);
}

export function computeMonth(
  month: string,
  ledger: LedgerRow[],
  expenses: ExpenseRow[],
  settings: FinanceSettings,
  rates: CommissionRate[],
): MonthlyFinance {
  const L = ledger.filter((r) => r.month === month);
  const E = expenses.filter((e) => e.month === month);
  const paid = L.filter((r) => r.status === "Pagado");

  const facturado = sum(paid.map((r) => r.amount_cents));
  const pendiente = sum(L.filter((r) => r.status === "Pendiente").map((r) => r.amount_cents));
  const n_pagos = paid.length;
  const gastos = sum(E.map((e) => e.amount_cents));
  const iva_soportado = sum(E.map((e) => e.vat_cents));

  // Tax + commission derivations are added in Tasks 3 and 4.
  return {
    month,
    facturado,
    pendiente,
    n_pagos,
    gastos,
    iva_soportado,
    declarado: 0,
    efectivo_exento: 0,
    comision_cobro: 0,
    comisiones_profesores: 0,
    comisiones_por_profesor: {},
    iva_a_pagar: 0,
    irpf: 0,
    beneficio_neto: 0,
    beneficio_simple: 0,
  };
}
```

- [ ] **Step 5: Run it — verify it passes**

Run: `npx vitest run src/lib/finance/compute.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/finance/types.ts src/lib/finance/compute.ts src/lib/finance/compute.test.ts
git commit -m "feat(finance): monthly aggregation (facturado/pendiente/gastos)"
```

---

## Task 3: Tax derivations (TDD)

Implements declarado, efectivo_exento, comision_cobro (processor fees), iva_a_pagar, irpf, beneficio_simple, beneficio_neto. Verified against the hand-computed `TEST` fixture (no collectors → teacher commissions stay 0).

**Files:**
- Modify: `src/lib/finance/compute.ts`
- Modify: `src/lib/finance/compute.test.ts`

- [ ] **Step 1: Add the failing tax test**

Append to `compute.test.ts`:

```ts
describe("computeMonth — tax derivations", () => {
  it("derives declarado, iva, irpf, beneficio (TEST fixture)", () => {
    const m = computeMonth("TEST", TAX_LEDGER, TAX_EXPENSES, SETTINGS, []);
    // declarado = round(15000 * 0.8) = 12000
    expect(m.declarado).toBe(12000);
    // efectivo_exento = 15000 - 12000 = 3000
    expect(m.efectivo_exento).toBe(3000);
    // fees 0 -> 0
    expect(m.comision_cobro).toBe(0);
    // iva = round(12000*0.21 - 630) = round(2520 - 630) = 1890
    expect(m.iva_a_pagar).toBe(1890);
    // irpf = round(max(12000-3000,0)*0.15) = round(1350) = 1350
    expect(m.irpf).toBe(1350);
    // beneficio_simple = 15000 - 3000 = 12000
    expect(m.beneficio_simple).toBe(12000);
    // neto = 15000 - 3000 - 0 - 0 - 1890 - 1350 = 8760
    expect(m.beneficio_neto).toBe(8760);
  });

  it("applies processor fees on T and B", () => {
    const m = computeMonth("TEST", TAX_LEDGER, TAX_EXPENSES, { ...SETTINGS, fee_revolut_pct: 0.01 }, []);
    // fee = round(10000*0.01 + 0) = 100
    expect(m.comision_cobro).toBe(100);
    expect(m.beneficio_neto).toBe(8660); // 8760 - 100
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/lib/finance/compute.test.ts`
Expected: FAIL — declarado is 0, etc.

- [ ] **Step 3: Implement the derivations**

In `compute.ts`, replace the block from `// Tax + commission derivations…` through the `return { … }` with:

```ts
  const declarado = Math.round(facturado * settings.declared_pct);
  const efectivo_exento = facturado - declarado;

  const sumByMethod = (mth: string) =>
    sum(paid.filter((r) => r.method === mth).map((r) => r.amount_cents));
  const comision_cobro = Math.round(
    sumByMethod("T") * settings.fee_revolut_pct + sumByMethod("B") * settings.fee_bizum_pct,
  );

  // Teacher commissions are added in Task 4.
  const comisiones_por_profesor: Record<string, number> = {};
  const comisiones_profesores = sum(Object.values(comisiones_por_profesor));

  const iva_a_pagar = Math.round(declarado * settings.iva_rate - iva_soportado);
  const irpf = Math.round(Math.max(declarado - gastos, 0) * settings.irpf_rate);
  const beneficio_simple = facturado - gastos;
  const beneficio_neto =
    facturado - gastos - comision_cobro - comisiones_profesores - iva_a_pagar - irpf;

  return {
    month,
    facturado,
    pendiente,
    n_pagos,
    gastos,
    iva_soportado,
    declarado,
    efectivo_exento,
    comision_cobro,
    comisiones_profesores,
    comisiones_por_profesor,
    iva_a_pagar,
    irpf,
    beneficio_neto,
    beneficio_simple,
  };
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npx vitest run src/lib/finance/compute.test.ts`
Expected: PASS (aggregation + tax tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/compute.ts src/lib/finance/compute.test.ts
git commit -m "feat(finance): tax derivations (declarado/iva/irpf/neto)"
```

---

## Task 4: Teacher commissions (TDD)

Cande → teacher. Per ledger row: each non-`Cande` teacher in `collector` gets `rate × share`, where `rate = commission_pct_override ?? default_pct(teacher) ?? 0` and `share = amount / (number of non-Cande teachers on that row)`. Basis = Pagado rows only.

**Files:**
- Modify: `src/lib/finance/compute.ts`
- Modify: `src/lib/finance/compute.test.ts`

- [ ] **Step 1: Add the failing commission test**

Append to `compute.test.ts`:

```ts
import type { CommissionRate } from "./types";

const RATES: CommissionRate[] = [
  { teacher: "Sofi", default_pct: 0.65 },
  { teacher: "Martu", default_pct: 0.4 },
];
const COM_LEDGER: LedgerRow[] = [
  { month: "COM", category: "Adulto", amount_cents: 8000, method: "E", status: "Pagado", collector: ["Sofi"], commission_pct_override: null },
  { month: "COM", category: "Taller", amount_cents: 6000, method: "E", status: "Pagado", collector: ["Sofi", "Martu"], commission_pct_override: null },
  { month: "COM", category: "Adulto", amount_cents: 5000, method: "E", status: "Pagado", collector: ["Sofi"], commission_pct_override: 0.5 },
  { month: "COM", category: "Adulto", amount_cents: 9000, method: "E", status: "Pagado", collector: ["Cande"], commission_pct_override: null },
  { month: "COM", category: "Adulto", amount_cents: 4000, method: "E", status: "Pendiente", collector: ["Sofi"], commission_pct_override: null },
];

describe("computeMonth — teacher commissions", () => {
  it("computes per-teacher commissions with override and multi-teacher split", () => {
    const m = computeMonth("COM", COM_LEDGER, [], SETTINGS, RATES);
    // Sofi: 8000*0.65=5200 + (6000/2)*0.65=1950 + 5000*0.5(override)=2500 = 9650
    expect(m.comisiones_por_profesor["Sofi"]).toBe(9650);
    // Martu: (6000/2)*0.4 = 1200
    expect(m.comisiones_por_profesor["Martu"]).toBe(1200);
    // Cande-only and Pendiente rows excluded
    expect(m.comisiones_por_profesor["Cande"]).toBeUndefined();
    expect(m.comisiones_profesores).toBe(10850);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/lib/finance/compute.test.ts`
Expected: FAIL — `comisiones_por_profesor` is empty.

- [ ] **Step 3: Implement the commission loop**

In `compute.ts`, replace the two lines:

```ts
  // Teacher commissions are added in Task 4.
  const comisiones_por_profesor: Record<string, number> = {};
  const comisiones_profesores = sum(Object.values(comisiones_por_profesor));
```

with:

```ts
  const rateMap = new Map(rates.map((r) => [r.teacher, r.default_pct]));
  const accPerTeacher: Record<string, number> = {};
  for (const r of paid) {
    const teachers = (r.collector ?? []).filter((t) => t && t !== OWNER);
    if (teachers.length === 0) continue;
    const share = (r.amount_cents ?? 0) / teachers.length;
    for (const t of teachers) {
      const rate = r.commission_pct_override ?? rateMap.get(t) ?? 0;
      accPerTeacher[t] = (accPerTeacher[t] ?? 0) + share * rate;
    }
  }
  const comisiones_por_profesor: Record<string, number> = {};
  for (const t of Object.keys(accPerTeacher)) {
    comisiones_por_profesor[t] = Math.round(accPerTeacher[t]);
  }
  const comisiones_profesores = sum(Object.values(comisiones_por_profesor));
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npx vitest run src/lib/finance/compute.test.ts`
Expected: PASS (all describe blocks). The `beneficio_neto` test from Task 3 still passes because the `TEST` fixture has no collectors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/compute.ts src/lib/finance/compute.test.ts
git commit -m "feat(finance): teacher commission engine (override + split)"
```

---

## Task 5: Year roll-up — `computeFinanceMonthly` + `sumMonthly` (TDD)

**Files:**
- Modify: `src/lib/finance/compute.ts`
- Modify: `src/lib/finance/compute.test.ts`

- [ ] **Step 1: Add the failing roll-up test**

Append to `compute.test.ts`:

```ts
import { computeFinanceMonthly, sumMonthly } from "./compute";

describe("computeFinanceMonthly + sumMonthly", () => {
  it("returns all 12 months in order", () => {
    const months = computeFinanceMonthly(TAX_LEDGER, TAX_EXPENSES, SETTINGS, []);
    expect(months).toHaveLength(12);
    expect(months[0].month).toBe("ENERO");
    expect(months.find((m) => m.month === "TEST")).toBeUndefined();
  });

  it("sums only months with real income for YTD totals", () => {
    const months = computeFinanceMonthly(
      [
        { month: "ENERO", category: null, amount_cents: 10000, method: "E", status: "Pagado", collector: null, commission_pct_override: null },
        { month: "FEBRERO", category: null, amount_cents: 20000, method: "E", status: "Pagado", collector: null, commission_pct_override: null },
      ],
      [],
      SETTINGS,
      [],
    );
    const t = sumMonthly(months);
    expect(t.facturado).toBe(30000);
    expect(t.realMonths).toBe(2);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/lib/finance/compute.test.ts`
Expected: FAIL — `computeFinanceMonthly` / `sumMonthly` not exported.

- [ ] **Step 3: Implement the roll-ups**

Append to `compute.ts`:

```ts
export function computeFinanceMonthly(
  ledger: LedgerRow[],
  expenses: ExpenseRow[],
  settings: FinanceSettings,
  rates: CommissionRate[],
): MonthlyFinance[] {
  return MONTHS.map((m) => computeMonth(m, ledger, expenses, settings, rates));
}

export interface FinanceTotals {
  facturado: number;
  pendiente: number;
  gastos: number;
  iva_a_pagar: number;
  irpf: number;
  comisiones_profesores: number;
  beneficio_neto: number;
  realMonths: number; // months with facturado > 0
}

export function sumMonthly(months: MonthlyFinance[]): FinanceTotals {
  const real = months.filter((m) => m.facturado > 0);
  const acc = (pick: (m: MonthlyFinance) => number) => real.reduce((s, m) => s + pick(m), 0);
  return {
    facturado: acc((m) => m.facturado),
    pendiente: acc((m) => m.pendiente),
    gastos: acc((m) => m.gastos),
    iva_a_pagar: acc((m) => m.iva_a_pagar),
    irpf: acc((m) => m.irpf),
    comisiones_profesores: acc((m) => m.comisiones_profesores),
    beneficio_neto: acc((m) => m.beneficio_neto),
    realMonths: real.length,
  };
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npx vitest run`
Expected: PASS — all finance tests.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/finance/compute.ts src/lib/finance/compute.test.ts
git commit -m "feat(finance): year roll-up + YTD totals"
```

---

## Task 6: Database migration (schema + RLS)

Migrations are **applied manually** in the Lovable SQL editor (Lovable Cloud does not auto-run them). We commit the migration file for repo history AND a copy under `docs/setup/` for pasting.

**Files:**
- Create: `supabase/migrations/20260621120000_finance_foundation.sql`
- Create: `docs/setup/apply-finance-foundation.sql` (identical content)

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260621120000_finance_foundation.sql` (and copy the same content to `docs/setup/apply-finance-foundation.sql`):

```sql
-- Finance-Hub foundation. All tables in public, RLS admin-only (is_admin()),
-- consistent with public.ledger_entries. Apply manually in the Lovable SQL editor.

-- 1) Ledger extensions for teacher commissions
ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS collector text[],
  ADD COLUMN IF NOT EXISTS commission_pct_override numeric;

-- 2) Expenses (Tab Gastos)
CREATE TABLE IF NOT EXISTS public.expense_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date,
  month text,
  category text,
  provider text,
  concept text,
  amount_cents integer,
  method text,
  notes text,
  vat_cents integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expense_admin_all" ON public.expense_entries;
CREATE POLICY "expense_admin_all" ON public.expense_entries
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE INDEX IF NOT EXISTS idx_expense_month ON public.expense_entries (month);

-- 3) Tax / settings singleton (the "yellow cells")
CREATE TABLE IF NOT EXISTS public.finance_settings (
  id integer PRIMARY KEY DEFAULT 1,
  iva_rate numeric NOT NULL DEFAULT 0.21,
  irpf_rate numeric NOT NULL DEFAULT 0.15,
  declared_pct numeric NOT NULL DEFAULT 0.80,
  fee_revolut_pct numeric NOT NULL DEFAULT 0,
  fee_bizum_pct numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_settings_singleton CHECK (id = 1)
);
ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "finance_settings_admin_all" ON public.finance_settings;
CREATE POLICY "finance_settings_admin_all" ON public.finance_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
INSERT INTO public.finance_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 4) Per-teacher commission rates
CREATE TABLE IF NOT EXISTS public.commission_rates (
  teacher text PRIMARY KEY,
  default_pct numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commission_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "commission_rates_admin_all" ON public.commission_rates;
CREATE POLICY "commission_rates_admin_all" ON public.commission_rates
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
INSERT INTO public.commission_rates (teacher, default_pct) VALUES
  ('Sofi', 0.65), ('Martu', 0)
  ON CONFLICT (teacher) DO NOTHING;
```

- [ ] **Step 2: Commit the migration files**

```bash
git add supabase/migrations/20260621120000_finance_foundation.sql docs/setup/apply-finance-foundation.sql
git commit -m "feat(finance): foundation migration (tables + RLS)"
```

- [ ] **Step 3: Apply manually (Tobi, in Lovable SQL editor)**

Paste `docs/setup/apply-finance-foundation.sql` into `Cloud → SQL editor` and run.

- [ ] **Step 4: Verify schema + RLS**

In the SQL editor:

```sql
select column_name from information_schema.columns
  where table_name='ledger_entries' and column_name in ('collector','commission_pct_override');
-- expect 2 rows
select * from public.finance_settings;           -- expect 1 row, id=1, defaults
select * from public.commission_rates order by teacher; -- expect Martu 0, Sofi 0.65
select relrowsecurity from pg_class where relname='expense_entries'; -- expect t
```

Then in the running app as a **non-admin** user, confirm `supabase.from('expense_entries').select('*')` returns 0 rows (RLS blocks). Document the result.

---

## Task 7: Import historical data (Excel → DB)

Imports real months (ENERO–MAYO) of *Pagos* into `ledger_entries` and *Gastos* into `expense_entries`. June stays as already imported in the app (active month) — not re-imported. PII stays out of the repo.

**Files:**
- Create: `scripts/gen-finance-import.py`
- Generated (NOT committed): `/tmp/finance-import.sql`

- [ ] **Step 1: Ensure the Excel is readable**

The workbook must be at `/tmp/cazu-cowork/Projects/Cazú Ceramics/Cazu_Finanzas.xlsx` (Tobi copied the CoWork folder there earlier). If missing, ask Tobi to re-run:
`cp -R "/Users/tobias.jung/Documents/Claude Cazu Ceramics" /tmp/cazu-cowork`

- [ ] **Step 2: Write the generator**

Create `scripts/gen-finance-import.py`:

```python
#!/usr/bin/env python3
"""Generate finance import SQL from Cazu_Finanzas.xlsx. Output goes to /tmp (PII)."""
from openpyxl import load_workbook

SRC = "/tmp/cazu-cowork/Projects/Cazú Ceramics/Cazu_Finanzas.xlsx"
OUT = "/tmp/finance-import.sql"
REAL_MONTHS = {"ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO"}

def cents(v):
    if v is None or v == "":
        return "NULL"
    s = str(v).replace("€", "").replace(".", "").replace(",", ".").strip() if isinstance(v, str) else v
    try:
        return str(round(float(s) * 100))
    except (ValueError, TypeError):
        return "NULL"

def q(v):
    if v is None or str(v).strip() == "":
        return "NULL"
    return "'" + str(v).strip().replace("'", "''") + "'"

wb = load_workbook(SRC, data_only=True)
lines = ["-- GENERATED finance import. Apply in Lovable SQL editor. Contains PII.", "BEGIN;"]

# Pagos -> ledger_entries (real months only)
pag = list(wb["Pagos"].iter_rows(values_only=True))[1:]  # skip header
n_pag = 0
for row in pag:
    fecha, mes, alumno, clase, cat, imp, met, estado, cobra, notas = (list(row) + [None] * 10)[:10]
    if mes not in REAL_MONTHS:
        continue
    n_pag += 1
    lines.append(
        "INSERT INTO public.ledger_entries (entry_date, month, student_name, item, category, amount_cents, method, status, notes) VALUES ("
        + f"{q(fecha) if fecha else 'NULL'}, {q(mes)}, {q(alumno)}, {q(clase)}, {q(cat)}, {cents(imp)}, {q(met)}, {q(estado)}, {q(notas)});"
    )

# Gastos -> expense_entries
gas = list(wb["Gastos"].iter_rows(values_only=True))[1:]
n_gas = 0
for row in gas:
    fecha, mes, cat, prov, concepto, imp, met, notas, iva = (list(row) + [None] * 9)[:9]
    if not mes:
        continue
    n_gas += 1
    lines.append(
        "INSERT INTO public.expense_entries (entry_date, month, category, provider, concept, amount_cents, method, notes, vat_cents) VALUES ("
        + f"{q(fecha) if fecha else 'NULL'}, {q(mes)}, {q(cat)}, {q(prov)}, {q(concepto)}, {cents(imp)}, {q(met)}, {q(notas)}, {cents(iva)});"
    )

lines.append("COMMIT;")
lines.append(f"-- pagos rows: {n_pag} | gastos rows: {n_gas}")
open(OUT, "w").write("\n".join(lines))
print(f"Wrote {OUT}: {n_pag} pagos, {n_gas} gastos")
```

- [ ] **Step 3: Run the generator**

Run: `python3 scripts/gen-finance-import.py`
Expected: prints row counts; `/tmp/finance-import.sql` exists. Open it and spot-check 2-3 INSERTs look correct (amounts in cents, months uppercase).

- [ ] **Step 4: Commit the generator (not the output)**

```bash
git add scripts/gen-finance-import.py
git commit -m "chore(finance): import generator (Excel -> SQL)"
```

Confirm `/tmp/finance-import.sql` is NOT staged (it lives in /tmp, outside the repo).

- [ ] **Step 5: Apply the import (Tobi, in Lovable SQL editor)**

Paste the contents of `/tmp/finance-import.sql` into `Cloud → SQL editor` and run.

- [ ] **Step 6: Verify against the Excel golden numbers**

In the SQL editor:

```sql
select month, round(sum(amount_cents) filter (where status='Pagado')/100.0, 0) as facturado
from public.ledger_entries
where month in ('ENERO','FEBRERO','MARZO','ABRIL','MAYO')
group by month
order by array_position(array['ENERO','FEBRERO','MARZO','ABRIL','MAYO'], month);
```

Expected (from `Documentacion_Dashboard.md` §4, ±a few € rounding):
ENERO ≈ 5615 · FEBRERO ≈ 5111 · MARZO ≈ 4075 · ABRIL ≈ 5040 · MAYO ≈ 5763 (TOTAL ≈ 25604).

If a month is off by more than a few euros, inspect the parsing (Spanish decimals, blank método/estado) before proceeding. Document the actual numbers.

---

## Self-Review

**1. Spec coverage (Phase 1a scope):**
- `ledger_entries` + `collector` + `commission_pct_override` → Task 6. ✅
- `expense_entries`, `finance_settings`, `commission_rates` + RLS → Task 6. ✅
- `computeFinanceMonthly` incl. `comisiones_profesores`, Excel formulas → Tasks 2–5. ✅
- Vitest setup → Task 1. ✅
- Real-month import + June reconcile (June not re-imported) → Task 7. ✅
- Tax formulas match spec 4.4 (declarado, efectivo_exento, comision_cobro, iva_a_pagar, irpf, beneficio_neto, beneficio_simple). ✅
- Commission model spec 4.5 (override ?? default, multi-teacher equal split, Pagado basis, excludes Cande). ✅
- NOT in 1a (deferred to 1b): dashboard, gastos UI, settings UI, registro form extension, nav, `R`-item fix. Listed in plan header / spec §9.

**2. Placeholder scan:** No TBD/TODO. The "added in Task N" comments are working code (values 0 / empty), replaced by later tasks — not placeholders.

**3. Type consistency:** `computeMonth`, `computeFinanceMonthly`, `sumMonthly`, `MonthlyFinance`, `FinanceTotals` names and signatures are consistent across tasks and tests. `collector` is `string[] | null` everywhere; `commission_pct_override` is `number | null` everywhere.

---

## Notes / risks

- **`is_admin()`** must exist (it does — used by `ledger_entries` RLS and many RPCs).
- **Two lockfiles** (`bun.lockb` + `package-lock.json`): install vitest with the same manager the repo uses (bun). If `bun` is unavailable, `npm i -D vitest` and commit `package-lock.json` instead.
- **Golden numbers** are the OLD-model figures (no teacher-commission deductions); historical rows have no `collector` tags so `comisiones_profesores = 0` and the figures stay valid as a baseline.
- **June reconcile:** June already has ~64 rows in the app; Task 7 does not import Excel's June template. If the app's June rows are a stale template, Tobi can clear them before Cande works the live month — decide during execution.
