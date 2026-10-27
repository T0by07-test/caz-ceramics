CREATE TABLE public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipients text NOT NULL,
  buyer_name text,
  buyer_contact text,
  description text,
  price_cents integer,
  is_paid boolean NOT NULL DEFAULT false,
  payment_method text,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  is_redeemed boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vouchers TO authenticated;
GRANT ALL ON public.vouchers TO service_role;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages vouchers" ON public.vouchers FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());