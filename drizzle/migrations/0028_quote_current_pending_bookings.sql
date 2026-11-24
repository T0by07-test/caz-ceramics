CREATE OR REPLACE FUNCTION public.pending_booking_amounts(p_booking_ids uuid[])
RETURNS TABLE(booking_id uuid, amount_cents integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid(); r record; v_ids uuid[];
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode = '28000'; END IF;
  IF EXISTS (SELECT 1 FROM bookings b WHERE b.id = ANY(p_booking_ids) AND b.student_id <> v_user)
     AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'NOT_OWNER' USING errcode = '42501';
  END IF;
  FOR r IN
    SELECT DISTINCT b.student_id, public.class_billing_month(b.class_id) m
    FROM bookings b WHERE b.id = ANY(p_booking_ids)
  LOOP
    SELECT array_agg(b.id) INTO v_ids
    FROM bookings b
    WHERE b.student_id = r.student_id AND public.class_billing_month(b.class_id) = r.m
      AND b.source = 'drop_in' AND b.status IN ('reserved','confirmed','attended')
      AND EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.status = 'pending' AND p.amount_cents > 0)
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.status = 'confirmed' AND p.amount_cents > 0);
    IF v_ids IS NULL THEN CONTINUE; END IF;
    RETURN QUERY
      SELECT a.booking_id,
        coalesce((SELECT p.amount_cents FROM payments p
                  WHERE p.booking_id = a.booking_id AND p.status = 'pending' AND p.method = 'cash'
                  ORDER BY p.created_at DESC, p.id LIMIT 1), a.amount_cents)::integer
      FROM public.drop_in_amounts(r.student_id, v_ids) a
      WHERE a.booking_id = ANY(p_booking_ids);
  END LOOP;
END $function$;
REVOKE ALL ON FUNCTION public.pending_booking_amounts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pending_booking_amounts(uuid[]) TO authenticated, service_role;