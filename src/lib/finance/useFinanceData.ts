import { useEffect, useState } from "react";
import {
  loadFinanceRows,
  DEFAULT_SETTINGS,
  type LedgerEntryRow,
  type ExpenseEntryRow,
  type CommissionRateRow,
} from "./db";
import { computeFinanceMonthly, sumMonthly, type FinanceTotals } from "./compute";
import type { FinanceSettings, MonthlyFinance } from "./types";

export interface FinanceData {
  loading: boolean;
  error: string | null;
  ledger: LedgerEntryRow[];
  expenses: ExpenseEntryRow[];
  rates: CommissionRateRow[];
  settings: FinanceSettings;
  monthly: MonthlyFinance[];
  totals: FinanceTotals;
  reload: () => void;
}

type LoadedState = Omit<FinanceData, "reload">;

const INITIAL: LoadedState = {
  loading: true,
  error: null,
  ledger: [],
  expenses: [],
  rates: [],
  settings: DEFAULT_SETTINGS,
  monthly: [],
  totals: sumMonthly([]),
};

export function useFinanceData(): FinanceData {
  const [state, setState] = useState<LoadedState>(INITIAL);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { ledger, expenses, settings, rates, error } = await loadFinanceRows();
      if (cancelled) return;
      const effSettings: FinanceSettings = settings
        ? {
            iva_rate: Number(settings.iva_rate),
            irpf_rate: Number(settings.irpf_rate),
            declared_pct: Number(settings.declared_pct),
            fee_revolut_pct: Number(settings.fee_revolut_pct),
            fee_bizum_pct: Number(settings.fee_bizum_pct),
          }
        : DEFAULT_SETTINGS;
      const activeRates = rates
        .filter((r) => r.active)
        .map((r) => ({ teacher: r.teacher, default_pct: Number(r.default_pct) }));
      const monthly = computeFinanceMonthly(ledger, expenses, effSettings, activeRates);
      setState({
        loading: false,
        error,
        ledger,
        expenses,
        rates,
        settings: effSettings,
        monthly,
        totals: sumMonthly(monthly),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
