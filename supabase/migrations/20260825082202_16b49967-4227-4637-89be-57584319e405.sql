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
  v_class record;
  v_count int;
  v_adults int := 0;
  v_kids int := 0;
  v_adult_total int;
  v_adult_per_booking int;
  v_kids_per_booking int := 1200;
BEGIN
  IF v_student IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode = '28000'; END IF;
  IF p_booking_ids IS NULL OR array_length(p_booking_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_BOOKINGS' USING errcode = '22023';
  END IF;

  v_count := array_length(p_booking_ids, 1);

  FOREACH v_booking_id IN ARRAY p_booking_ids LOOP
    SELECT id, student_id, source, status, class_id INTO v_booking
      FROM public.bookings WHERE id = v_booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING errcode = 'P0002'; END IF;
    IF v_booking.student_id <> v_student THEN RAISE EXCEPTION 'NOT_OWNER' USING errcode = '42501'; END IF;
    IF v_booking.source <> 'drop_in' THEN RAISE EXCEPTION 'INVALID_SOURCE' USING errcode = '22023'; END IF;

    SELECT audience INTO v_class FROM public.classes WHERE id = v_booking.class_id;
    IF v_class.audience = 'kids' THEN
      v_kids := v_kids + 1;
    ELSE
      v_adults := v_adults + 1;
    END IF;
  END LOOP;

  -- Adult tiered pricing: 1=30€, 2=55€, 3=70€, 4=85€, extras 20€.
  v_adult_total := CASE
    WHEN v_adults = 0 THEN 0
    WHEN v_adults = 1 THEN 3000
    WHEN v_adults = 2 THEN 5500
    WHEN v_adults = 3 THEN 7000
    WHEN v_adults = 4 THEN 8500
    ELSE 8500 + (v_adults - 4) * 2000
  END;
  v_adult_per_booking := CASE WHEN v_adults > 0 THEN round(v_adult_total::numeric / v_adults) ELSE 0 END;

  FOREACH v_booking_id IN ARRAY p_booking_ids LOOP
    SELECT id, student_id, source, status, class_id INTO v_booking
      FROM public.bookings WHERE id = v_booking_id FOR UPDATE;

    IF EXISTS (SELECT 1 FROM public.payments WHERE booking_id = v_booking_id AND method = 'cash') THEN
      CONTINUE;
    END IF;
    IF v_booking.status NOT IN ('reserved','confirmed') THEN
      RAISE EXCEPTION 'BOOKING_NOT_ACTIVE' USING errcode = '22023';
    END IF;

    SELECT audience INTO v_class FROM public.classes WHERE id = v_booking.class_id;

    INSERT INTO public.payments (student_id, booking_id, amount_cents, status, method)
      VALUES (v_student, v_booking_id,
        CASE WHEN v_class.audience = 'kids' THEN v_kids_per_booking ELSE v_adult_per_booking END,
        'pending', 'cash');

    UPDATE public.bookings SET status = 'confirmed' WHERE id = v_booking_id AND status = 'reserved';

    PERFORM public.enqueue_notification(
      v_student, 'reservation_confirmed',
      jsonb_build_object('booking_id', v_booking_id, 'method', 'cash'),
      v_booking_id::text
    );
  END LOOP;
END;
$function$;