-- Calendar-month rules for make-ups, cross-month moves and pending-cash recalculation.

CREATE OR REPLACE FUNCTION public.makeup_month(p_expires timestamptz)
RETURNS date LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT date_trunc('month', (p_expires AT TIME ZONE 'Europe/Madrid'))::date
$$;

CREATE OR REPLACE FUNCTION public.sync_cash_ledger(p_session text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE ledger_entries le
     SET amount_cents = (SELECT coalesce(sum(p.amount_cents),0)::int FROM payments p
                          WHERE p.stripe_session_id = p_session AND p.status IN ('pending','confirmed'))
   WHERE p_session IS NOT NULL AND p_session NOT LIKE 'cs_%'
     AND le.stripe_session_id = p_session AND le.status = 'Pendiente'
$$;
REVOKE EXECUTE ON FUNCTION public.sync_cash_ledger(text) FROM PUBLIC, anon, authenticated;

-- Recalculate pending CASH amounts of a student's adult drop-in bookings in one
-- class month so they add up to the monthly tier minus what is already
-- confirmed. Never touches confirmed payments; never charges or refunds.
CREATE OR REPLACE FUNCTION public.recalc_month_pending_cash(p_student uuid, p_month date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  r record; k int; v_inc int; v_c int[] := ARRAY[0,0,0];
  v_target int := 0; v_confirmed int := 0; v_sum int := 0; v_diff int; v_take int;
  v_pending uuid[] := '{}'; v_amounts int[] := '{}'; i int; v_sessions text[] := '{}';
BEGIN
  FOR r IN
    SELECT b.id, least(2, coalesce(b.guests,0)) g,
      (SELECT coalesce(sum(p.amount_cents),0) FROM payments p WHERE p.booking_id = b.id AND p.status = 'confirmed' AND p.amount_cents > 0) conf,
      (SELECT p.id FROM payments p WHERE p.booking_id = b.id AND p.status = 'pending' AND p.method = 'cash' AND p.amount_cents > 0 ORDER BY p.created_at LIMIT 1) pend
    FROM bookings b JOIN classes c ON c.id = b.class_id
    WHERE b.student_id = p_student AND b.source = 'drop_in'
      AND b.status IN ('reserved','confirmed','attended') AND c.audience <> 'kids'
      AND date_trunc('month', c.date) = date_trunc('month', p_month)
      AND EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.amount_cents > 0
                  AND (p.status = 'confirmed' OR (p.status = 'pending' AND p.method = 'cash')))
    ORDER BY c.date, c.start_time, b.created_at, b.id
  LOOP
    v_inc := 0;
    FOR k IN 0..r.g LOOP
      v_inc := v_inc + public.adult_tier_cents(v_c[k+1] + 1) - public.adult_tier_cents(v_c[k+1]);
      v_c[k+1] := v_c[k+1] + 1;
    END LOOP;
    v_confirmed := v_confirmed + r.conf;
    IF r.conf = 0 AND r.pend IS NOT NULL THEN
      v_pending := v_pending || r.pend; v_amounts := v_amounts || v_inc; v_sum := v_sum + v_inc;
    END IF;
  END LOOP;
  IF coalesce(array_length(v_pending,1),0) = 0 THEN RETURN; END IF;
  FOR k IN 0..2 LOOP v_target := v_target + public.adult_tier_cents(v_c[k+1]); END LOOP;

  v_diff := greatest(0, v_target - v_confirmed) - v_sum;
  i := array_length(v_pending,1);
  IF v_diff > 0 THEN v_amounts[i] := v_amounts[i] + v_diff; END IF;
  WHILE v_diff < 0 AND i >= 1 LOOP
    v_take := least(v_amounts[i], -v_diff);
    v_amounts[i] := v_amounts[i] - v_take; v_diff := v_diff + v_take; i := i - 1;
  END LOOP;

  FOR i IN 1..array_length(v_pending,1) LOOP
    UPDATE payments SET amount_cents = v_amounts[i]
     WHERE id = v_pending[i] AND amount_cents <> v_amounts[i];
    v_sessions := v_sessions || (SELECT stripe_session_id FROM payments WHERE id = v_pending[i]);
  END LOOP;

  FOR i IN 1..coalesce(array_length(v_sessions,1),0) LOOP
    PERFORM public.sync_cash_ledger(v_sessions[i]);
  END LOOP;
END $function$;
REVOKE EXECUTE ON FUNCTION public.recalc_month_pending_cash(uuid, date) FROM PUBLIC, anon, authenticated;

-- Make-ups can only be used inside the calendar month of the original class.
CREATE OR REPLACE FUNCTION public.book_makeup(p_class_id uuid)
 RETURNS TABLE(booking_id uuid, makeup_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_student uuid := auth.uid();
  v_class record; v_count int; v_makeup record; v_new_id uuid;
begin
  if v_student is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;

  select id, status, capacity_max, date into v_class from public.classes where id = p_class_id for update;
  if not found then raise exception 'CLASS_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_class.status <> 'scheduled' then raise exception 'CLASS_NOT_SCHEDULED' using errcode = '22023'; end if;

  if exists (select 1 from public.bookings where class_id = p_class_id and student_id = v_student
              and status in ('reserved','confirmed','attended')) then
    raise exception 'ALREADY_BOOKED' using errcode = '22023';
  end if;

  select count(*) into v_count from public.bookings
   where class_id = p_class_id and status in ('reserved','confirmed','attended');
  if v_count >= v_class.capacity_max then raise exception 'CLASS_FULL' using errcode = '22023'; end if;

  select m.id into v_makeup from public.makeups m
   where m.student_id = v_student and m.used_booking_id is null and m.expires_at > now()
     and public.makeup_month(m.expires_at) = date_trunc('month', v_class.date)::date
   order by m.expires_at asc, m.created_at asc limit 1 for update;
  if not found then
    if exists (select 1 from public.makeups m where m.student_id = v_student
                and m.used_booking_id is null and m.expires_at > now()) then
      raise exception 'MAKEUP_WRONG_MONTH' using errcode = '22023',
        hint = 'La recuperación solo se puede usar en el mismo mes de la clase cancelada.';
    end if;
    raise exception 'NO_MAKEUPS_AVAILABLE' using errcode = '22023';
  end if;

  insert into public.bookings (student_id, class_id, source, status)
    values (v_student, p_class_id, 'makeup', 'confirmed') returning id into v_new_id;
  update public.makeups set used_booking_id = v_new_id where id = v_makeup.id;

  booking_id := v_new_id; makeup_id := v_makeup.id; return next;
end;
$function$;

-- Student cancellation: a cancelled make-up booking gives back its ORIGINAL
-- credit (same origin and expiry) instead of minting a new one; ordinary
-- cancellations recalculate the month's pending cash amounts.
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
 RETURNS TABLE(booking_id uuid, status text, makeup_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_student uuid := auth.uid();
  v_booking record; v_class record; v_start_madrid timestamptz; v_now timestamptz := now();
  v_recoverable boolean; v_new_status text; v_existing_makeup uuid; v_makeup uuid;
  v_expires_at timestamptz; v_session text;
begin
  if v_student is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;

  select b.id, b.student_id, b.class_id, b.status, b.source into v_booking
    from public.bookings b where b.id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_booking.student_id <> v_student then raise exception 'NOT_OWNER' using errcode = '42501'; end if;

  if v_booking.status in ('cancelled_recoverable','cancelled_lost') then
    select m.id into v_existing_makeup from public.makeups m
      where m.source_booking_id = v_booking.id or m.used_booking_id = v_booking.id limit 1;
    booking_id := v_booking.id; status := v_booking.status; makeup_id := v_existing_makeup;
    return next; return;
  end if;

  select c.date, c.start_time, c.audience into v_class from public.classes c where c.id = v_booking.class_id;
  if not found then raise exception 'CLASS_NOT_FOUND' using errcode = 'P0002'; end if;

  v_start_madrid := ((v_class.date::text || ' ' || v_class.start_time::text)::timestamp) at time zone 'Europe/Madrid';
  v_recoverable := v_now < (v_start_madrid - interval '12 hours');
  v_new_status := case when v_recoverable then 'cancelled_recoverable' else 'cancelled_lost' end;

  update public.bookings b set status = v_new_status, cancelled_at = v_now where b.id = v_booking.id;

  select p.stripe_session_id into v_session from public.payments p
    where p.booking_id = v_booking.id and p.status = 'pending' and p.amount_cents > 0 limit 1;
  update public.payments p set status = 'failed' where p.booking_id = v_booking.id and p.status = 'pending';
  if v_session is not null and v_session not like 'cs_%' then
    if not exists (select 1 from public.payments p where p.stripe_session_id = v_session
                    and p.status in ('pending','confirmed')) then
      delete from public.ledger_entries le where le.stripe_session_id = v_session;
    end if;
  end if;

  if v_booking.source = 'makeup' then
    if v_recoverable then
      update public.makeups m set used_booking_id = null
       where m.used_booking_id = v_booking.id and m.expires_at > v_now
      returning m.id into v_makeup;
    end if;
  elsif v_recoverable then
    v_expires_at := ((date_trunc('month', v_class.date) + interval '1 month' - interval '1 day')::date::text
                     || ' 23:59:00')::timestamp at time zone 'Europe/Madrid';
    insert into public.makeups (student_id, source_booking_id, expires_at)
      values (v_student, v_booking.id, v_expires_at) returning id into v_makeup;
  end if;

  if v_booking.source = 'drop_in' and v_class.audience <> 'kids' then
    perform public.recalc_month_pending_cash(v_student, v_class.date);
  end if;
  perform public.sync_cash_ledger(v_session);

  perform public.promote_waitlist(v_booking.class_id);
  booking_id := v_booking.id; status := v_new_status; makeup_id := v_makeup; return next;
end;
$function$;

-- Studio auto-cancellation: same inheritance rule for make-up bookings.
CREATE OR REPLACE FUNCTION public.auto_cancel_low_attendance()
 RETURNS TABLE(cancelled_class_id uuid, affected_bookings integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_class record; v_count int; v_now timestamptz := now(); v_start_madrid timestamptz;
  v_expires_at timestamptz; v_affected int; v_aff record;
begin
  for v_class in select id, date, start_time from public.classes where status = 'scheduled' loop
    v_start_madrid := ((v_class.date::text || ' ' || v_class.start_time::text)::timestamp) at time zone 'Europe/Madrid';
    if v_start_madrid < v_now or v_start_madrid > v_now + interval '24 hours' then continue; end if;

    select count(*) into v_count from public.bookings
      where class_id = v_class.id and status in ('reserved','confirmed','attended');
    if v_count >= 3 then continue; end if;

    update public.classes set status = 'auto_cancelled' where id = v_class.id;
    v_expires_at := ((date_trunc('month', v_class.date) + interval '1 month' - interval '1 day')::date::text
                     || ' 23:59:00')::timestamp at time zone 'Europe/Madrid';
    v_affected := 0;
    for v_aff in
      update public.bookings set status = 'cancelled_recoverable', cancelled_at = v_now
       where class_id = v_class.id and status in ('reserved','confirmed','attended')
       returning id, student_id, source
    loop
      if v_aff.source = 'makeup' then
        update public.makeups set used_booking_id = null where used_booking_id = v_aff.id;
      else
        insert into public.makeups (student_id, source_booking_id, expires_at)
          values (v_aff.student_id, v_aff.id, v_expires_at);
      end if;
      perform public.enqueue_notification(v_aff.student_id, 'class_cancelled',
        jsonb_build_object('class_id', v_class.id, 'reason', 'low_attendance'), v_class.id::text);
      v_affected := v_affected + 1;
    end loop;
    cancelled_class_id := v_class.id; affected_bookings := v_affected; return next;
  end loop;
end;
$function$;

-- Admin moves stay inside the class's calendar month.
CREATE OR REPLACE FUNCTION public.admin_move_booking(p_booking_id uuid, p_target_class_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid(); v_booking record; v_target record; v_from_date date; v_count int;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'NOT_ADMIN' USING errcode = '42501'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'REASON_REQUIRED' USING errcode = '22023'; END IF;

  SELECT id, student_id, class_id, status, source INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF v_booking.status NOT IN ('reserved','confirmed','attended') THEN RAISE EXCEPTION 'BOOKING_NOT_ACTIVE'; END IF;

  SELECT id, status, capacity_max, date INTO v_target FROM public.classes WHERE id = p_target_class_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_CLASS_NOT_FOUND'; END IF;
  IF v_target.status <> 'scheduled' THEN RAISE EXCEPTION 'TARGET_NOT_SCHEDULED'; END IF;

  SELECT date INTO v_from_date FROM public.classes WHERE id = v_booking.class_id;
  IF v_booking.source = 'makeup' THEN
    IF EXISTS (SELECT 1 FROM public.makeups m WHERE m.used_booking_id = p_booking_id
                AND public.makeup_month(m.expires_at) <> date_trunc('month', v_target.date)::date) THEN
      RAISE EXCEPTION 'MAKEUP_MONTH_MISMATCH' USING errcode = '22023',
        hint = 'Una recuperación solo puede moverse dentro del mes de la clase cancelada original.';
    END IF;
  END IF;
  IF date_trunc('month', v_from_date) <> date_trunc('month', v_target.date) THEN
    RAISE EXCEPTION 'CROSS_MONTH_MOVE' USING errcode = '22023',
      hint = 'No se puede mover una reserva a otro mes: cancélala y crea una nueva reserva en ese mes.';
  END IF;

  SELECT count(*) INTO v_count FROM public.bookings
    WHERE class_id = p_target_class_id AND status IN ('reserved','confirmed','attended');
  IF v_count >= v_target.capacity_max THEN RAISE EXCEPTION 'TARGET_FULL'; END IF;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE class_id = p_target_class_id AND student_id = v_booking.student_id
              AND status IN ('reserved','confirmed','attended')) THEN RAISE EXCEPTION 'ALREADY_BOOKED_TARGET'; END IF;

  UPDATE public.bookings SET class_id = p_target_class_id WHERE id = p_booking_id;
  INSERT INTO public.admin_actions (admin_id, student_id, action_type, reason, metadata)
  VALUES (v_admin, v_booking.student_id, 'move_booking', p_reason,
    jsonb_build_object('booking_id', p_booking_id, 'from_class_id', v_booking.class_id, 'to_class_id', p_target_class_id));
  PERFORM public.promote_waitlist(v_booking.class_id);
END;
$function$;

-- Admin removal: void the removed booking's pending cash charge and recalc the month.
CREATE OR REPLACE FUNCTION public.admin_remove_booking(p_booking_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_admin uuid := auth.uid(); v_booking record; v_class record; v_session text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'NOT_ADMIN' USING errcode = '42501'; END IF;
  SELECT id, student_id, class_id, status, source INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING errcode = 'P0002'; END IF;
  IF v_booking.status NOT IN ('reserved','confirmed','attended') THEN RAISE EXCEPTION 'BOOKING_NOT_ACTIVE' USING errcode = '22023'; END IF;

  UPDATE public.bookings SET status = 'cancelled_lost', cancelled_at = now() WHERE id = p_booking_id;

  SELECT p.stripe_session_id INTO v_session FROM public.payments p
    WHERE p.booking_id = p_booking_id AND p.status = 'pending' AND p.method = 'cash' AND p.amount_cents > 0 LIMIT 1;
  UPDATE public.payments SET status = 'failed' WHERE booking_id = p_booking_id AND status = 'pending' AND method = 'cash';
  IF v_session IS NOT NULL AND v_session NOT LIKE 'cs_%' AND NOT EXISTS (
     SELECT 1 FROM public.payments p WHERE p.stripe_session_id = v_session AND p.status IN ('pending','confirmed')) THEN
    DELETE FROM public.ledger_entries WHERE stripe_session_id = v_session;
  END IF;

  SELECT date, audience INTO v_class FROM public.classes WHERE id = v_booking.class_id;
  IF v_booking.source = 'drop_in' AND v_class.audience <> 'kids' THEN
    PERFORM public.recalc_month_pending_cash(v_booking.student_id, v_class.date);
  END IF;
  PERFORM public.sync_cash_ledger(v_session);

  INSERT INTO public.admin_actions (admin_id, student_id, action_type, reason, metadata)
  VALUES (v_admin, v_booking.student_id, 'remove_booking',
    coalesce(nullif(trim(p_reason), ''), 'Eliminada por administración'),
    jsonb_build_object('booking_id', p_booking_id, 'class_id', v_booking.class_id));
  PERFORM public.promote_waitlist(v_booking.class_id);
END;
$function$;