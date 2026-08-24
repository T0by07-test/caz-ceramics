CREATE OR REPLACE FUNCTION public.pay_drop_in_cash_batch(p_booking_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student uuid := auth.uid();
  v_booking_id uuid;
  v_booking record;
  v_count int;
  v_total int;
  v_per_booking int;
BEGIN
  IF v_student IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode = '28000'; END IF;
  IF p_booking_ids IS NULL OR array_length(p_booking_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_BOOKINGS' USING errcode = '22023';
  END IF;

  v_count := array_length(p_booking_ids, 1);
  v_total := CASE
    WHEN v_count = 1 THEN 3000
    WHEN v_count = 2 THEN 5500
    WHEN v_count = 3 THEN 7000
    ELSE 8500 + (v_count - 4) * 2000
  END;
  v_per_booking := round(v_total::numeric / v_count);

  FOREACH v_booking_id IN ARRAY p_booking_ids LOOP
    SELECT id, student_id, source, status INTO v_booking
      FROM public.bookings WHERE id = v_booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING errcode = 'P0002'; END IF;
    IF v_booking.student_id <> v_student THEN RAISE EXCEPTION 'NOT_OWNER' USING errcode = '42501'; END IF;
    IF v_booking.source <> 'drop_in' THEN RAISE EXCEPTION 'INVALID_SOURCE' USING errcode = '22023'; END IF;

    IF EXISTS (SELECT 1 FROM public.payments WHERE booking_id = v_booking_id AND method = 'cash') THEN
      CONTINUE;
    END IF;
    IF v_booking.status NOT IN ('reserved','confirmed') THEN
      RAISE EXCEPTION 'BOOKING_NOT_ACTIVE' USING errcode = '22023';
    END IF;

    INSERT INTO public.payments (student_id, booking_id, amount_cents, status, method)
      VALUES (v_student, v_booking_id, v_per_booking, 'pending', 'cash');

    UPDATE public.bookings SET status = 'confirmed' WHERE id = v_booking_id AND status = 'reserved';

    PERFORM public.enqueue_notification(
      v_student, 'reservation_confirmed',
      jsonb_build_object('booking_id', v_booking_id, 'method', 'cash'),
      v_booking_id::text
    );
  END LOOP;
END;
$function$;