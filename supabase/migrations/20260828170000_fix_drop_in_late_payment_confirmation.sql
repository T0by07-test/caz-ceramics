-- Bug: Maria Bossotto and Tomás Eslava (and others) booked drop-in classes,
-- started a card checkout that didn't complete within 30 minutes, and
-- expire_pending_drop_ins() correctly cancelled the un-paid hold. But if the
-- card payment *does* complete afterwards, confirm_drop_in_booking only
-- matched `status = 'reserved'`, so the booking stayed 'cancelled_lost'
-- forever even though the payment is now 'confirmed' — a paid-but-no-seat
-- state with no automatic recovery.
--
-- Two changes:
-- 1. Widen the hold window from 30 to 60 minutes, so a normal (if slightly
--    slow) checkout is less likely to get swept before it finishes.
-- 2. Make confirm_drop_in_booking reclaim the seat when a late payment
--    completes and the class still has room (nobody else took the spot via
--    the waitlist in the meantime). If the class filled up in the meantime,
--    the payment still confirms but the seat can't be silently reclaimed —
--    that rare case needs a manual follow-up (refund or granted recuperación)
--    via the existing admin tools.

CREATE OR REPLACE FUNCTION public.expire_pending_drop_ins()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row record; v_count int := 0;
BEGIN
  FOR v_row IN
    SELECT b.id AS booking_id, b.class_id
      FROM public.bookings b
     WHERE b.source = 'drop_in'
       AND b.status = 'reserved'
       AND b.created_at < now() - interval '60 minutes'
       AND NOT EXISTS (
         SELECT 1 FROM public.payments p
          WHERE p.booking_id = b.id
            AND (p.status = 'confirmed' OR p.method = 'cash')
       )
  LOOP
    UPDATE public.bookings SET status = 'cancelled_lost', cancelled_at = now() WHERE id = v_row.booking_id;
    UPDATE public.payments SET status = 'failed'
      WHERE booking_id = v_row.booking_id AND status = 'pending';
    PERFORM public.promote_waitlist(v_row.class_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_drop_in_booking(p_session_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment record;
  v_booking record;
  v_new_bookings uuid[] := '{}';
  v_student uuid;
  v_classes jsonb;
  v_active_count int;
  v_capacity_max int;
BEGIN
  FOR v_payment IN
    SELECT id, booking_id, status, student_id
      FROM public.payments
      WHERE stripe_session_id = p_session_id
      FOR UPDATE
  LOOP
    IF v_payment.status = 'confirmed' THEN
      CONTINUE;
    END IF;
    UPDATE public.payments SET status = 'confirmed' WHERE id = v_payment.id;
    IF v_payment.booking_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT id, class_id, status INTO v_booking
      FROM public.bookings WHERE id = v_payment.booking_id FOR UPDATE;

    IF v_booking.status = 'reserved' THEN
      UPDATE public.bookings SET status = 'confirmed' WHERE id = v_booking.id;
      v_new_bookings := array_append(v_new_bookings, v_booking.id);
      v_student := v_payment.student_id;
    ELSIF v_booking.status = 'cancelled_lost' THEN
      SELECT capacity_max INTO v_capacity_max FROM public.classes WHERE id = v_booking.class_id;
      SELECT count(*) INTO v_active_count
        FROM public.bookings
        WHERE class_id = v_booking.class_id AND status IN ('reserved', 'confirmed', 'attended');
      IF v_active_count < v_capacity_max THEN
        UPDATE public.bookings SET status = 'confirmed', cancelled_at = NULL WHERE id = v_booking.id;
        v_new_bookings := array_append(v_new_bookings, v_booking.id);
        v_student := v_payment.student_id;
      END IF;
    END IF;
  END LOOP;

  IF array_length(v_new_bookings, 1) IS NOT NULL AND v_student IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'date', c.date,
      'start_time', c.start_time,
      'end_time', c.end_time,
      'teacher', c.teacher,
      'audience', c.audience
    ) ORDER BY c.date, c.start_time), '[]'::jsonb)
    INTO v_classes
    FROM public.bookings b
    JOIN public.classes c ON c.id = b.class_id
    WHERE b.id = ANY(v_new_bookings);

    IF jsonb_array_length(v_classes) > 0 THEN
      PERFORM public.enqueue_notification(
        v_student,
        'reservation_confirmed',
        jsonb_build_object('classes', v_classes),
        p_session_id
      );
    END IF;
  END IF;
END;
$function$;
