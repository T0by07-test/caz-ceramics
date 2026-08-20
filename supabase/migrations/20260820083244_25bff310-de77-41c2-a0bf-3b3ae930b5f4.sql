ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS teacher text;

UPDATE public.classes SET teacher = 'Sofi' WHERE audience = 'kids' AND teacher IS NULL;

WITH days AS (
  SELECT d::date AS date FROM generate_series('2026-09-01'::date, '2026-12-31'::date, interval '1 day') d
),
slots(dow, start_time, end_time, audience, teacher) AS (
  VALUES
    (1, '17:00'::time, '18:00'::time, 'kids', 'Sofi'),
    (1, '18:30'::time, '20:30'::time, 'adults', 'Sofi'),
    (2, '18:30'::time, '20:30'::time, 'adults', 'Cande'),
    (3, '10:30'::time, '12:30'::time, 'adults', 'Cande'),
    (3, '15:00'::time, '17:00'::time, 'adults', 'Cande'),
    (3, '18:30'::time, '20:30'::time, 'adults', 'Cande'),
    (4, '16:00'::time, '18:00'::time, 'adults', 'Cande'),
    (4, '18:30'::time, '20:30'::time, 'adults', 'Cande'),
    (5, '10:30'::time, '12:30'::time, 'adults', 'Cande'),
    (5, '17:30'::time, '19:30'::time, 'adults', 'Sofi')
)
INSERT INTO public.classes (date, start_time, end_time, audience, teacher, status)
SELECT d.date, s.start_time, s.end_time, s.audience, s.teacher, 'scheduled'
FROM days d
JOIN slots s ON extract(isodow FROM d.date) = s.dow
WHERE NOT EXISTS (
  SELECT 1 FROM public.classes c
  WHERE c.date = d.date AND c.start_time = s.start_time
);