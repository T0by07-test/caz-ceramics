import { supabase } from "@/integrations/supabase/client";
import type { LedgerRow, ExpenseRow, FinanceSettings, CommissionRate } from "./types";

export type LedgerEntryRow = LedgerRow & {
  id: string;
  entry_date: string | null;
  student_name: string | null;
  item: string | null;
  notes: string | null;
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

export type SettingsRow = FinanceSettings & { id: number };
export type CommissionRateRow = CommissionRate & { active: boolean };

// The finance tables are not in the generated Supabase types — wrap with a
// permissive cast, same approach as the ledger access in admin.registro.tsx.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tbl = (name: string) => (supabase.from as any)(name);

export const DEFAULT_SETTINGS: FinanceSettings = {
  iva_rate: 0.21,
  irpf_rate: 0.15,
  declared_pct: 0.8,
  fee_revolut_pct: 0,
  fee_bizum_pct: 0,
};

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
    settings: (settings.data ?? null) as SettingsRow | null,
    rates: (rates.data ?? []) as CommissionRateRow[],
    error:
      ledger.error || expenses.error || settings.error || rates.error
        ? (ledger.error || expenses.error || settings.error || rates.error)!.message
        : null,
  };
}
