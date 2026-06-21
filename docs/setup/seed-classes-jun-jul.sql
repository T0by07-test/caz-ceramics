-- ============================================================================
-- Cazu Ceramics — wiederkehrende Klassen für 01.06.2026 – 31.07.2026
-- In Lovable: Cloud → SQL editor → einfügen → Run.
-- Idempotent: überspringt Klassen, die zu Datum+Uhrzeit schon existieren.
-- Annahmen: Dauer 120 Min (2 h); Kapazität = Tabellen-Defaults (ideal 6 / max 7).
-- ============================================================================

ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS instructor text;

WITH slots(dow, start_t, dur_min, title, instructor) AS (
  VALUES
    -- dow: 1=Lunes 2=Martes 3=Miércoles 4=Jueves 5=Viernes
    (1, TIME '17:00', 120, 'Clase niños', 'Sofi'),
    (1, TIME '18:30', 120, NULL, 'Sofi'),
    (2, TIME '18:30', 120, NULL, NULL),
    (3, TIME '10:30', 120, NULL, NULL),
    (3, TIME '15:00', 120, NULL, NULL),
    (3, TIME '18:30', 120, NULL, NULL),
    (4, TIME '16:00', 120, NULL, NULL),
    (4, TIME '18:30', 120, NULL, NULL),
    (5, TIME '11:00', 120, NULL, NULL),
    (5, TIME '17:30', 120, NULL, 'Sofi')
),
days AS (
  SELECT d::date AS day
  FROM generate_series(DATE '2026-06-01', DATE '2026-07-31', INTERVAL '1 day') AS d
)
INSERT INTO public.classes (date, start_time, end_time, status, title, instructor)
SELECT days.day, s.start_t, (s.start_t + make_interval(mins => s.dur_min)), 'scheduled', s.title, s.instructor
FROM days JOIN slots s ON EXTRACT(DOW FROM days.day) = s.dow
WHERE NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.date = days.day AND c.start_time = s.start_t);

-- Falls Klassen bereits mit anderer Dauer angelegt wurden: alle auf 2 h setzen.
UPDATE public.classes SET end_time = start_time + INTERVAL '2 hours' WHERE status = 'scheduled';

SELECT count(*) AS clases_creadas FROM public.classes WHERE status = 'scheduled';
