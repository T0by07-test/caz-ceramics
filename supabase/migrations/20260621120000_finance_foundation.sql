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
