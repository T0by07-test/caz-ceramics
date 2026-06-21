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
}
