-- When a card/Bizum payment succeeds for a booking that already had a pending
-- cash payment row (student reserved with "efectivo" and later paid online),
-- void the cash row so the booking isn't counted twice in the ledger.
CREATE OR REPLACE FUNCTION public.confirm_drop_in_booking(p_session_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    -- Void any other still-pending payment row for the same booking
    -- (typically the cash row created when the student chose "efectivo").
    UPDATE public.payments
       SET status = 'failed'
     WHERE booking_id = v_payment.booking_id
       AND id <> v_payment.id
       AND status = 'pending';

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
$$;

REVOKE ALL ON FUNCTION public.confirm_drop_in_booking(text) FROM PUBLIC, anon, authenticated;
