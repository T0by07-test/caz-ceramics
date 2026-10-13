CREATE OR REPLACE FUNCTION public.adult_tier_cents(n int) RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN n <= 0 THEN 0 WHEN n = 1 THEN 3000 WHEN n = 2 THEN 5500 WHEN n = 3 THEN 7000 WHEN n = 4 THEN 8500 ELSE 8500 + (n - 4) * 2000 END
$$;

-- Adult seats a student already paid (card confirmed) or committed to pay (cash pending/confirmed) in a month.
CREATE OR REPLACE FUNCTION public.prior_adult_seats(p_student uuid, p_month date, p_exclude uuid[])
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(1 + coalesce(b.guests,0)),0)::int
  FROM bookings b JOIN classes c ON c.id = b.class_id
  WHERE b.student_id = p_student AND b.source = 'drop_in'
    AND b.status IN ('reserved','confirmed','attended')
    AND c.audience <> 'kids'
    AND date_trunc('month', c.date) = date_trunc('month', p_month)
    AND NOT (b.id = ANY(coalesce(p_exclude, '{}'::uuid[])))
    AND EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.amount_cents > 0
                AND (p.status = 'confirmed' OR (p.status = 'pending' AND p.method = 'cash')))
$$;

-- Amount owed for each of these bookings, charging only the difference to the next monthly tier.
CREATE OR REPLACE FUNCTION public.drop_in_amounts(p_student uuid, p_booking_ids uuid[])
RETURNS TABLE(booking_id uuid, amount_cents int) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_month date := NULL; v_base int := 0; v_seats int;
BEGIN
  FOR r IN SELECT b.id, coalesce(b.guests,0) g, c.audience, date_trunc('month', c.date)::date m
           FROM bookings b JOIN classes c ON c.id = b.class_id
           WHERE b.id = ANY(p_booking_ids) AND b.student_id = p_student
           ORDER BY c.audience = 'kids', date_trunc('month', c.date), c.date, c.start_time, b.id
  LOOP
    v_seats := 1 + r.g;
    IF r.audience = 'kids' THEN
      booking_id := r.id; amount_cents := 1200 * v_seats; RETURN NEXT; CONTINUE;
    END IF;
    IF v_month IS DISTINCT FROM r.m THEN
      v_month := r.m; v_base := public.prior_adult_seats(p_student, r.m, p_booking_ids);
    END IF;
    booking_id := r.id;
    amount_cents := public.adult_tier_cents(v_base + v_seats) - public.adult_tier_cents(v_base);
    v_base := v_base + v_seats;
    RETURN NEXT;
  END LOOP;
END $$;

-- Price preview for the logged-in student's selection (before booking).
CREATE OR REPLACE FUNCTION public.quote_my_selection(p_class_ids uuid[], p_guests int)
RETURNS int LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_uid uuid := auth.uid(); v_month date := NULL; v_base int := 0; v_total int := 0; v_seats int := 1 + greatest(0, coalesce(p_guests,0));
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  FOR r IN SELECT c.id, c.audience, date_trunc('month', c.date)::date m FROM classes c
           WHERE c.id = ANY(p_class_ids) ORDER BY c.audience = 'kids', c.date, c.start_time
  LOOP
    IF r.audience = 'kids' THEN v_total := v_total + 1200 * v_seats; CONTINUE; END IF;
    IF v_month IS DISTINCT FROM r.m THEN
      v_month := r.m;
      v_base := public.prior_adult_seats(v_uid, r.m,
        ARRAY(SELECT b.id FROM bookings b WHERE b.student_id = v_uid AND b.class_id = ANY(p_class_ids)));
    END IF;
    v_total := v_total + public.adult_tier_cents(v_base + v_seats) - public.adult_tier_cents(v_base);
    v_base := v_base + v_seats;
  END LOOP;
  RETURN v_total;
END $$;

REVOKE ALL ON FUNCTION public.prior_adult_seats(uuid, date, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.drop_in_amounts(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prior_adult_seats(uuid, date, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.drop_in_amounts(uuid, uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.quote_my_selection(uuid[], int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_my_selection(uuid[], int) TO authenticated;

CREATE OR REPLACE FUNCTION public.pay_drop_in_cash_batch(p_booking_ids uuid[])
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_student uuid := auth.uid();
  v_booking_id uuid;
  v_booking record;
  v_count int := 0;
  v_amount int;
  v_classes jsonb := '[]'::jsonb;
  v_dedup text; v_key text; v_total int := 0; v_name text;
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
BEGIN
  IF v_student IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode = '28000'; END IF;
  IF p_booking_ids IS NULL OR array_length(p_booking_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_BOOKINGS' USING errcode = '22023';
  END IF;

  FOREACH v_booking_id IN ARRAY p_booking_ids LOOP
    SELECT id, student_id, source, status, class_id, guests INTO v_booking
      FROM public.bookings WHERE id = v_booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING errcode = 'P0002'; END IF;
    IF v_booking.student_id <> v_student THEN RAISE EXCEPTION 'NOT_OWNER' USING errcode = '42501'; END IF;
    IF v_booking.source <> 'drop_in' THEN RAISE EXCEPTION 'INVALID_SOURCE' USING errcode = '22023'; END IF;
    v_count := v_count + 1 + coalesce(v_booking.guests, 0);
  END LOOP;

  SELECT md5(array_to_string(array_agg(id ORDER BY id), ',')) INTO v_dedup FROM unnest(p_booking_ids) AS id;
  v_key := 'cash:' || v_dedup;

  FOR v_booking_id, v_amount IN SELECT a.booking_id, a.amount_cents FROM public.drop_in_amounts(v_student, p_booking_ids) a LOOP
    SELECT id, status, class_id, guests INTO v_booking FROM public.bookings WHERE id = v_booking_id;
    IF EXISTS (SELECT 1 FROM public.payments WHERE booking_id = v_booking_id AND method = 'cash' AND status <> 'void') THEN
      CONTINUE;
    END IF;
    IF v_booking.status NOT IN ('reserved','confirmed') THEN
      RAISE EXCEPTION 'BOOKING_NOT_ACTIVE' USING errcode = '22023';
    END IF;

    INSERT INTO public.payments (student_id, booking_id, amount_cents, status, method, stripe_session_id)
      VALUES (v_student, v_booking_id, v_amount, 'pending', 'cash', v_key);
    v_total := v_total + v_amount;

    UPDATE public.bookings SET status = 'confirmed' WHERE id = v_booking_id AND status = 'reserved';

    SELECT v_classes || jsonb_build_object('date', c.date, 'start_time', c.start_time, 'end_time', c.end_time,
      'teacher', c.teacher, 'audience', c.audience, 'guests', coalesce(v_booking.guests, 0))
    INTO v_classes FROM public.classes c WHERE c.id = v_booking.class_id;
  END LOOP;

  IF jsonb_array_length(v_classes) > 0 THEN
    SELECT coalesce(nullif(trim(coalesce(p.name,'') || ' ' || coalesce(p.surname,'')), ''), p.email, 'Alumna')
      INTO v_name FROM public.profiles p WHERE p.id = v_student;

    INSERT INTO public.ledger_entries (entry_date, month, student_name, item, category, amount_cents, method, status, notes, stripe_session_id)
    VALUES (v_today, to_char(v_today, 'YYYY-MM'), v_name,
      v_count || CASE WHEN v_count = 1 THEN ' clase' ELSE ' clases' END,
      'Clases', v_total, 'E', 'Pendiente', 'Reserva con pago en efectivo en el taller', v_key)
    ON CONFLICT (stripe_session_id) DO NOTHING;

    PERFORM public.enqueue_notification(v_student, 'reservation_confirmed',
      jsonb_build_object('classes', v_classes, 'method', 'cash'), v_dedup);
  END IF;
END;
$function$;