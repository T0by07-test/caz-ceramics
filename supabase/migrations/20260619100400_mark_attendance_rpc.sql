-- Block A · A4.1 — mark_attendance RPC (admin check-in)
--
-- Lets an admin mark a booking as attended (check-in) or undo it back to
-- confirmed. Modeled on the existing admin RPCs (admin_move_booking /
-- admin_grant_makeup): SECURITY DEFINER, is_admin() guard, writes an
-- admin_actions audit row.
--
-- Shared contract #2:
--   public.mark_attendance(p_booking_id uuid, p_status text)
--   p_status = 'attended' (mark present) | 'confirmed' (undo)
--   Updates public.bookings.status, inserts an admin_actions row
--   (action_type = 'mark_attendance'). Granted to authenticated.
--   Frontend: supabase.rpc('mark_attendance', { p_booking_id, p_status }).
--
-- Note: bookings.status already allows both 'attended' and 'confirmed' in its
-- CHECK constraint, so no table alteration is needed. Per spec A4 the default
-- scope is "record only" — there is no no_show status in Block A.

CREATE OR REPLACE FUNCTION public.mark_attendance(
  p_booking_id uuid,
  p_status text
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

  IF p_status NOT IN ('attended','confirmed') THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING errcode = '22023';
  END IF;

  SELECT id, student_id, class_id, status INTO v_booking
    FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  -- Only an active (non-cancelled) booking can be checked in / undone.
  IF v_booking.status NOT IN ('reserved','confirmed','attended') THEN
    RAISE EXCEPTION 'BOOKING_NOT_ACTIVE';
  END IF;

  UPDATE public.bookings SET status = p_status WHERE id = p_booking_id;

  INSERT INTO public.admin_actions (admin_id, student_id, action_type, reason, metadata)
  VALUES (v_admin, v_booking.student_id, 'mark_attendance', NULL,
    jsonb_build_object(
      'booking_id', p_booking_id,
      'class_id', v_booking.class_id,
      'from_status', v_booking.status,
      'to_status', p_status
    ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_attendance(uuid, text) TO authenticated;
