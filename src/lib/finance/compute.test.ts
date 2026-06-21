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
