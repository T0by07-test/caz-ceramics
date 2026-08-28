-- Lets an admin remove a student's booking from a class (e.g. wrong enrollment,
-- a dispute, freeing a spot) without going through the student's own 12-hour
-- recoverable/lost cancellation policy. Frees the seat for the waitlist.
CREATE OR REPLACE FUNCTION public.admin_remove_booking(
  p_booking_id uuid,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_booking record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN' USING errcode = '42501';
  END IF;

  SELECT id, student_id, class_id, status INTO v_booking
    FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING errcode = 'P0002'; END IF;
  IF v_booking.status NOT IN ('reserved','confirmed','attended') THEN
    RAISE EXCEPTION 'BOOKING_NOT_ACTIVE' USING errcode = '22023';
  END IF;

  UPDATE public.bookings SET status = 'cancelled_lost', cancelled_at = now()
    WHERE id = p_booking_id;

  INSERT INTO public.admin_actions (admin_id, student_id, action_type, reason, metadata)
  VALUES (v_admin, v_booking.student_id, 'remove_booking',
    coalesce(nullif(trim(p_reason), ''), 'Eliminada por administración'),
    jsonb_build_object('booking_id', p_booking_id, 'class_id', v_booking.class_id));

  PERFORM public.promote_waitlist(v_booking.class_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_remove_booking(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_booking(uuid, text) TO authenticated, service_role;
