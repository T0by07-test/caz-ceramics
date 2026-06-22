ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'adults'
  CHECK (audience IN ('adults', 'kids'));

CREATE INDEX IF NOT EXISTS classes_audience_date_idx
  ON public.classes (audience, date);

INSERT INTO public.classes (date, start_time, end_time, capacity_ideal, capacity_max, status, audience)
SELECT
  d::date,
  '17:00'::time,
  '18:00'::time,
  6,
  7,
  'scheduled',
  'kids'
FROM generate_series(
  (CURRENT_DATE + ((1 - EXTRACT(ISODOW FROM CURRENT_DATE)::int + 7) % 7))::date,
  (CURRENT_DATE + INTERVAL '16 weeks')::date,
  INTERVAL '7 days'
) AS d
WHERE NOT EXISTS (
  SELECT 1 FROM public.classes c
  WHERE c.date = d::date
    AND c.start_time = '17:00'::time
    AND c.audience = 'kids'
);