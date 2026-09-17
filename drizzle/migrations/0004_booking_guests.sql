ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guests integer NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_names text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.bookings ADD CONSTRAINT bookings_guests_range CHECK (guests >= 0 AND guests <= 2);

CREATE OR REPLACE FUNCTION public.class_seats_taken(p_class_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(sum(1 + b.guests), 0)::int
    FROM public.bookings b
   WHERE b.class_id = p_class_id
     AND b.status IN ('reserved','confirmed','attended')
$$;
REVOKE ALL ON FUNCTION public.class_seats_taken(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.class_seats_taken(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.public_class_availability()
RETURNS TABLE(class_id uuid, booked_count integer, capacity_max integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id,
         (SELECT coalesce(sum(1 + b.guests), 0)::int FROM public.bookings b
           WHERE b.class_id = c.id
             AND b.status IN ('reserved','confirmed','attended')),
         c.capacity_max
  FROM public.classes c
  WHERE c.status = 'scheduled'
$$;

DROP FUNCTION IF EXISTS public.book_class(uuid, text);

CREATE OR REPLACE FUNCTION public.book_class(
  p_class_id uuid,
  p_source text,
  p_guests integer DEFAULT 0,
  p_guest_names text[] DEFAULT '{}'
)
RETURNS TABLE(booking_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_student uuid := auth.uid();
  v_class record;
  v_existing record;
  v_seats int;
  v_guests int := coalesce(p_guests, 0);
  v_names text[] := coalesce(p_guest_names, '{}');
  v_new_id uuid;
begin
  if v_student is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_source <> 'drop_in' then
    raise exception 'PAYMENT_CHOICE_REQUIRED' using errcode = '22023';
  end if;

  if v_guests < 0 or v_guests > 2 then
    raise exception 'INVALID_GUESTS' using errcode = '22023';
  end if;

  select c.id, c.date, c.start_time, c.status, c.capacity_max
    into v_class
    from public.classes c
    where c.id = p_class_id
    for update;

  if not found then
    raise exception 'CLASS_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_class.status <> 'scheduled' then
    raise exception 'CLASS_NOT_SCHEDULED' using errcode = '22023';
  end if;

  select b.id, b.status
    into v_existing
    from public.bookings b
    where b.class_id = p_class_id
      and b.student_id = v_student
      and b.status in ('reserved','confirmed','attended')
    limit 1;

  if found then
    booking_id := v_existing.id;
    status := v_existing.status;
    return next;
    return;
  end if;

  select coalesce(sum(1 + b.guests), 0)::int into v_seats
    from public.bookings b
    where b.class_id = p_class_id
      and b.status in ('reserved','confirmed','attended');

  if v_seats + 1 + v_guests > v_class.capacity_max then
    raise exception 'CLASS_FULL' using errcode = '22023';
  end if;

  insert into public.bookings (student_id, class_id, source, status, guests, guest_names)
    values (v_student, p_class_id, 'drop_in', 'reserved', v_guests, v_names)
    returning id into v_new_id;

  insert into public.payments (student_id, booking_id, amount_cents, status)
    values (v_student, v_new_id, 0, 'pending');

  booking_id := v_new_id;
  status := 'reserved';
  return next;
end;
$function$;
REVOKE ALL ON FUNCTION public.book_class(uuid, text, integer, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_class(uuid, text, integer, text[]) TO authenticated, service_role;

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
  v_count int := 0;
  v_adults int := 0;
  v_kids int := 0;
  v_adult_total int;
  v_adult_per_seat int;
  v_kids_per_seat int := 1200;
  v_seats int;
  v_classes jsonb := '[]'::jsonb;
  v_dedup text;
  v_key text;
  v_total int;
  v_name text;
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

    v_seats := 1 + coalesce(v_booking.guests, 0);
    v_count := v_count + v_seats;

    SELECT audience INTO v_class FROM public.classes WHERE id = v_booking.class_id;
    IF v_class.audience = 'kids' THEN
      v_kids := v_kids + v_seats;
    ELSE
      v_adults := v_adults + v_seats;
    END IF;
  END LOOP;

  v_adult_total := CASE
    WHEN v_adults = 0 THEN 0
    WHEN v_adults = 1 THEN 3000
    WHEN v_adults = 2 THEN 5500
    WHEN v_adults = 3 THEN 7000
    WHEN v_adults = 4 THEN 8500
    ELSE 8500 + (v_adults - 4) * 2000
  END;
  v_adult_per_seat := CASE WHEN v_adults > 0 THEN round(v_adult_total::numeric / v_adults) ELSE 0 END;
  v_total := v_adult_total + v_kids * v_kids_per_seat;

  SELECT md5(array_to_string(array_agg(id ORDER BY id), ','))
  INTO v_dedup
  FROM unnest(p_booking_ids) AS id;
  v_key := 'cash:' || v_dedup;

  FOREACH v_booking_id IN ARRAY p_booking_ids LOOP
    SELECT id, student_id, source, status, class_id, guests INTO v_booking
      FROM public.bookings WHERE id = v_booking_id FOR UPDATE;

    IF EXISTS (SELECT 1 FROM public.payments WHERE booking_id = v_booking_id AND method = 'cash') THEN
      CONTINUE;
    END IF;
    IF v_booking.status NOT IN ('reserved','confirmed') THEN
      RAISE EXCEPTION 'BOOKING_NOT_ACTIVE' USING errcode = '22023';
    END IF;

    v_seats := 1 + coalesce(v_booking.guests, 0);
    SELECT audience INTO v_class FROM public.classes WHERE id = v_booking.class_id;

    INSERT INTO public.payments (student_id, booking_id, amount_cents, status, method, stripe_session_id)
      VALUES (v_student, v_booking_id,
        CASE WHEN v_class.audience = 'kids' THEN v_kids_per_seat * v_seats ELSE v_adult_per_seat * v_seats END,
        'pending', 'cash', v_key);

    UPDATE public.bookings SET status = 'confirmed' WHERE id = v_booking_id AND status = 'reserved';

    SELECT v_classes || jsonb_build_object(
      'date', c.date,
      'start_time', c.start_time,
      'end_time', c.end_time,
      'teacher', c.teacher,
      'audience', c.audience,
      'guests', coalesce(v_booking.guests, 0)
    )
    INTO v_classes
    FROM public.classes c
    WHERE c.id = v_booking.class_id;
  END LOOP;

  IF jsonb_array_length(v_classes) > 0 THEN
    SELECT coalesce(nullif(trim(coalesce(p.name,'') || ' ' || coalesce(p.surname,'')), ''), p.email, 'Alumna')
      INTO v_name FROM public.profiles p WHERE p.id = v_student;

    INSERT INTO public.ledger_entries (
      entry_date, month, student_name, item, category, amount_cents, method, status, notes, stripe_session_id
    ) VALUES (
      v_today, to_char(v_today, 'YYYY-MM'), v_name,
      v_count || CASE WHEN v_count = 1 THEN ' clase' ELSE ' clases' END,
      'Clases', v_total, 'E', 'Pendiente',
      'Reserva con pago en efectivo en el taller', v_key
    ) ON CONFLICT (stripe_session_id) DO NOTHING;

    PERFORM public.enqueue_notification(
      v_student, 'reservation_confirmed',
      jsonb_build_object('classes', v_classes, 'method', 'cash'),
      v_dedup
    );
  END IF;
END;
$function$;

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

    UPDATE public.payments
       SET status = 'failed'
     WHERE booking_id = v_payment.booking_id
       AND id <> v_payment.id
       AND status = 'pending';

    SELECT id, class_id, status, guests INTO v_booking
      FROM public.bookings WHERE id = v_payment.booking_id FOR UPDATE;

    IF v_booking.status = 'reserved' THEN
      UPDATE public.bookings SET status = 'confirmed' WHERE id = v_booking.id;
      v_new_bookings := array_append(v_new_bookings, v_booking.id);
      v_student := v_payment.student_id;
    ELSIF v_booking.status = 'cancelled_lost' THEN
      SELECT capacity_max INTO v_capacity_max FROM public.classes WHERE id = v_booking.class_id;
      SELECT coalesce(sum(1 + b.guests), 0)::int INTO v_active_count
        FROM public.bookings b
        WHERE b.class_id = v_booking.class_id AND b.status IN ('reserved', 'confirmed', 'attended');
      IF v_active_count + 1 + coalesce(v_booking.guests, 0) <= v_capacity_max THEN
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
      'audience', c.audience,
      'guests', coalesce(b.guests, 0)
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