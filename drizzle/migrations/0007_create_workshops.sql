CREATE TABLE public.workshops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  title text NOT NULL,
  client_name text,
  attendees integer,
  price_cents integer,
  contact text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workshops TO authenticated;
GRANT ALL ON public.workshops TO service_role;
ALTER TABLE public.workshops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages workshops" ON public.workshops FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());