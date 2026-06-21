-- Ledger / Registro: faithful digital copy of Cande's income & activity sheet.
-- Admin-only. Holds classes, drop-ins, coworking, products, kiln (horno) and
-- workshops as free-form rows — NOT tied to student accounts or the plan model.
-- (Data is imported separately via the SQL editor; the import file is kept out
-- of the repo because it contains student names / amounts = PII.)
--
-- Method codes (raw from the sheet): T=tarjeta, E=efectivo, B=bizum, R=? (confirm).

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date,
  month text,
  student_name text,
  item text,
  category text,
  amount_cents integer,
  method text,
  status text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ledger_admin_all" ON public.ledger_entries;
CREATE POLICY "ledger_admin_all" ON public.ledger_entries
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_ledger_month ON public.ledger_entries (month);
CREATE INDEX IF NOT EXISTS idx_ledger_status ON public.ledger_entries (status);
