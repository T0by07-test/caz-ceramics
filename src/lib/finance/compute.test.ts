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
