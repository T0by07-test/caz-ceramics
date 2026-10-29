CREATE TABLE public.firing_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL CHECK (length(trim(customer_name)) > 0),
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  extra_small integer NOT NULL DEFAULT 0 CHECK (extra_small >= 0),
  small integer NOT NULL DEFAULT 0 CHECK (small >= 0),
  medium integer NOT NULL DEFAULT 0 CHECK (medium >= 0),
  large integer NOT NULL DEFAULT 0 CHECK (large >= 0),
  extra_large integer NOT NULL DEFAULT 0 CHECK (extra_large >= 0),
  total_cents integer GENERATED ALWAYS AS (extra_small * 150 + small * 350 + medium * 500 + large * 700 + extra_large * 1100) STORED,
  is_paid boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT firing_orders_has_pieces CHECK (extra_small + small + medium + large + extra_large > 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firing_orders TO authenticated;
GRANT ALL ON public.firing_orders TO service_role;
ALTER TABLE public.firing_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages firing orders" ON public.firing_orders FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE INDEX firing_orders_received_date_idx ON public.firing_orders (received_date DESC);
COMMENT ON TABLE public.firing_orders IS 'Private external pottery firing register. Per-piece prices include biscuit and glaze firings.';