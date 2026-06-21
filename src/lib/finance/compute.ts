import {
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
