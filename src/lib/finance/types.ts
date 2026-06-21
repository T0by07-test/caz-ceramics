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
