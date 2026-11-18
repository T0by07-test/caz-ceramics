ALTER TABLE public.workshops ADD COLUMN class_id uuid REFERENCES public.classes(id);
CREATE INDEX workshops_class_id_idx ON public.workshops(class_id) WHERE class_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.class_seats_taken(p_class_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT ((SELECT coalesce(sum(1 + b.guests), 0) FROM public.bookings b WHERE b.class_id = p_class_id AND b.status IN ('reserved','confirmed','attended'))
    + (SELECT coalesce(sum(greatest(coalesce(w.attendees, 0), 0)), 0) FROM public.workshops w WHERE w.class_id = p_class_id))::integer
$function$;
CREATE OR REPLACE FUNCTION public.public_class_availability()
RETURNS TABLE(class_id uuid, booked_count integer, capacity_max integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT c.id, public.class_seats_taken(c.id), c.capacity_max FROM public.classes c WHERE c.status = 'scheduled'
$function$;