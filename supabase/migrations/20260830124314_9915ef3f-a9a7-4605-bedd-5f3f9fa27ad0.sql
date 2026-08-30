CREATE OR REPLACE FUNCTION public.public_class_availability()
RETURNS TABLE(class_id uuid, booked_count integer, capacity_max integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id,
         (SELECT count(*)::int FROM public.bookings b
           WHERE b.class_id = c.id
             AND b.status IN ('reserved','confirmed','attended')),
         c.capacity_max
  FROM public.classes c
  WHERE c.status = 'scheduled'
    AND c.date >= ((now() AT TIME ZONE 'Europe/Madrid')::date - interval '1 day')
$$;

REVOKE ALL ON FUNCTION public.public_class_availability() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_class_availability() TO anon, authenticated;