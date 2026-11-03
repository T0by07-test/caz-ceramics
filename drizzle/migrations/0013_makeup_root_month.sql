ALTER TABLE public.makeups ADD COLUMN IF NOT EXISTS origin_month date;
COMMENT ON COLUMN public.makeups.origin_month IS 'Calendar month (Europe/Madrid) of the root cancelled class; NULL on legacy rows = derive via chain.';

CREATE OR REPLACE FUNCTION public.makeup_origin_month(p_makeup uuid)
RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_cur uuid := p_makeup; v_seen uuid[] := '{}'; v_m record; v_b record; v_parent uuid; v_i int := 0;
BEGIN
  LOOP
    v_i := v_i + 1;
    IF v_cur IS NULL OR v_cur = ANY(v_seen) OR v_i > 50 THEN RETURN NULL; END IF; -- cycle: fail closed
    v_seen := v_seen || v_cur;
    SELECT id, origin_month, source_booking_id, expires_at INTO v_m FROM public.makeups WHERE id = v_cur;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF v_m.origin_month IS NOT NULL THEN RETURN v_m.origin_month; END IF;
    -- Manual courtesy credits point at a synthetic (unrelated) booking: their month is the grant month.
    IF EXISTS (SELECT 1 FROM public.admin_actions a WHERE a.action_type = 'grant_makeup'
                AND a.metadata->>'makeup_id' = v_m.id::text) THEN
      RETURN public.makeup_month(v_m.expires_at);
    END IF;
    SELECT b.id, b.source, c.date INTO v_b FROM public.bookings b JOIN public.classes c ON c.id = b.class_id
      WHERE b.id = v_m.source_booking_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF v_b.source = 'makeup' THEN
      SELECT id INTO v_parent FROM public.makeups WHERE used_booking_id = v_b.id AND id <> v_m.id LIMIT 1;
      IF v_parent IS NOT NULL THEN v_cur := v_parent; CONTINUE; END IF;
    END IF;
    RETURN date_trunc('month', v_b.date)::date;
  END LOOP;
END $$;

-- Usable while now() < first instant of the month after the origin month (Madrid).
-- An earlier expires_at may limit it; legacy 23:59 month-end expiries do not cut the last minute.
CREATE OR REPLACE FUNCTION public.makeup_deadline(p_makeup uuid)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_origin date := public.makeup_origin_month(p_makeup); v_next timestamptz; v_exp timestamptz;
BEGIN
  IF v_origin IS NULL THEN RETURN '-infinity'; END IF;
  v_next := ((v_origin + interval '1 month')::timestamp) AT TIME ZONE 'Europe/Madrid';
  SELECT expires_at INTO v_exp FROM public.makeups WHERE id = p_makeup;
  IF v_exp >= v_next - interval '1 minute' THEN RETURN v_next; END IF;
  RETURN v_exp;
END $$;

REVOKE EXECUTE ON FUNCTION public.makeup_origin_month(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.makeup_deadline(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.book_makeup(p_class_id uuid)
 RETURNS TABLE(booking_id uuid, makeup_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_student uuid := auth.uid(); v_class record; v_count int; v_makeup record; v_new_id uuid;
begin
  if v_student is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  select id, status, capacity_max, date into v_class from public.classes where id = p_class_id for update;
  if not found then raise exception 'CLASS_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_class.status <> 'scheduled' then raise exception 'CLASS_NOT_SCHEDULED' using errcode = '22023'; end if;
  if exists (select 1 from public.bookings where class_id = p_class_id and student_id = v_student
              and status in ('reserved','confirmed','attended')) then
    raise exception 'ALREADY_BOOKED' using errcode = '22023';
  end if;
  select count(*) into v_count from public.bookings where class_id = p_class_id and status in ('reserved','confirmed','attended');
  if v_count >= v_class.capacity_max then raise exception 'CLASS_FULL' using errcode = '22023'; end if;

  select m.id into v_makeup from public.makeups m
   where m.student_id = v_student and m.used_booking_id is null
     and now() < public.makeup_deadline(m.id)
     and public.makeup_origin_month(m.id) = date_trunc('month', v_class.date)::date
   order by public.makeup_deadline(m.id) asc, m.created_at asc limit 1 for update;
  if not found then
    if exists (select 1 from public.makeups m where m.student_id = v_student
                and m.used_booking_id is null and now() < public.makeup_deadline(m.id)) then
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

CREATE OR REPLACE FUNCTION public.admin_move_booking(p_booking_id uuid, p_target_class_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
                AND public.makeup_origin_month(m.id) IS DISTINCT FROM date_trunc('month', v_target.date)::date) THEN
      RAISE EXCEPTION 'MAKEUP_MONTH_MISMATCH' USING errcode = '22023',
        hint = 'Una recuperación solo puede moverse dentro del mes de la clase cancelada original.';
    END IF;
  END IF;
  IF date_trunc('month', v_from_date) <> date_trunc('month', v_target.date) THEN
    RAISE EXCEPTION 'CROSS_MONTH_MOVE' USING errcode = '22023',
      hint = 'No se puede mover una reserva a otro mes: cancélala y crea una nueva reserva en ese mes.';
  END IF;
  SELECT count(*) INTO v_count FROM public.bookings WHERE class_id = p_target_class_id AND status IN ('reserved','confirmed','attended');
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

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
 RETURNS TABLE(booking_id uuid, status text, makeup_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_student uuid := auth.uid();
  v_booking record; v_class record; v_start_madrid timestamptz; v_now timestamptz := now();
  v_recoverable boolean; v_new_status text; v_existing_makeup uuid; v_makeup uuid;
  v_month date; v_session text;
begin
  if v_student is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  select b.id, b.student_id, b.class_id, b.status, b.source into v_booking from public.bookings b where b.id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_booking.student_id <> v_student then raise exception 'NOT_OWNER' using errcode = '42501'; end if;
  if v_booking.status in ('cancelled_recoverable','cancelled_lost') then
    select m.id into v_existing_makeup from public.makeups m
      where m.source_booking_id = v_booking.id or m.used_booking_id = v_booking.id limit 1;
    booking_id := v_booking.id; status := v_booking.status; makeup_id := v_existing_makeup; return next; return;
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
    if not exists (select 1 from public.payments p where p.stripe_session_id = v_session and p.status in ('pending','confirmed')) then
      delete from public.ledger_entries le where le.stripe_session_id = v_session;
    end if;
  end if;

  if v_booking.source = 'makeup' then
    -- Free the SAME credit (origin + expiry preserved); never mint a new one.
    if v_recoverable then
      update public.makeups m set used_booking_id = null
       where m.used_booking_id = v_booking.id and v_now < public.makeup_deadline(m.id)
      returning m.id into v_makeup;
    end if;
  elsif v_recoverable then
    v_month := date_trunc('month', v_class.date)::date;
    insert into public.makeups (student_id, source_booking_id, expires_at, origin_month)
      values (v_student, v_booking.id, ((v_month + interval '1 month')::timestamp) at time zone 'Europe/Madrid', v_month)
      returning id into v_makeup;
  end if;

  if v_booking.source = 'drop_in' and v_class.audience <> 'kids' then
    perform public.recalc_month_pending_cash(v_student, v_class.date);
  end if;
  perform public.sync_cash_ledger(v_session);
  perform public.promote_waitlist(v_booking.class_id);
  booking_id := v_booking.id; status := v_new_status; makeup_id := v_makeup; return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.auto_cancel_low_attendance()
 RETURNS TABLE(cancelled_class_id uuid, affected_bookings integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_class record; v_count int; v_now timestamptz := now(); v_start_madrid timestamptz;
  v_month date; v_affected int; v_aff record; v_session text;
begin
  for v_class in select id, date, start_time, audience from public.classes where status = 'scheduled' loop
    v_start_madrid := ((v_class.date::text || ' ' || v_class.start_time::text)::timestamp) at time zone 'Europe/Madrid';
    if v_start_madrid < v_now or v_start_madrid > v_now + interval '24 hours' then continue; end if;
    select count(*) into v_count from public.bookings where class_id = v_class.id and status in ('reserved','confirmed','attended');
    if v_count >= 3 then continue; end if;

    update public.classes set status = 'auto_cancelled' where id = v_class.id;
    v_month := date_trunc('month', v_class.date)::date;
    v_affected := 0;
    for v_aff in
      update public.bookings set status = 'cancelled_recoverable', cancelled_at = v_now
       where class_id = v_class.id and status in ('reserved','confirmed','attended')
       returning id, student_id, source
    loop
      if v_aff.source = 'makeup' then
        -- Same credit returns with its original root month and expiry.
        update public.makeups set used_booking_id = null where used_booking_id = v_aff.id;
      else
        insert into public.makeups (student_id, source_booking_id, expires_at, origin_month)
          values (v_aff.student_id, v_aff.id, ((v_month + interval '1 month')::timestamp) at time zone 'Europe/Madrid', v_month);
      end if;
      -- Studio cancelled: pending (unpaid) charges for this class are voided, month re-priced.
      v_session := null;
      select p.stripe_session_id into v_session from public.payments p
        where p.booking_id = v_aff.id and p.status = 'pending' and p.amount_cents > 0 limit 1;
      update public.payments set status = 'failed' where booking_id = v_aff.id and status = 'pending';
      if v_aff.source = 'drop_in' and v_class.audience <> 'kids' then
        perform public.recalc_month_pending_cash(v_aff.student_id, v_class.date);
      end if;
      perform public.sync_cash_ledger(v_session);
      perform public.enqueue_notification(v_aff.student_id, 'class_cancelled',
        jsonb_build_object('class_id', v_class.id, 'reason', 'low_attendance'), v_class.id::text);
      v_affected := v_affected + 1;
    end loop;
    cancelled_class_id := v_class.id; affected_bookings := v_affected; return next;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_grant_makeup(p_student_id uuid, p_reason text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_admin uuid := auth.uid(); v_synthetic_booking uuid; v_makeup_id uuid; v_month date; v_expires timestamptz;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'NOT_ADMIN' USING errcode = '42501'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'REASON_REQUIRED' USING errcode = '22023'; END IF;
  v_month := date_trunc('month', (now() AT TIME ZONE 'Europe/Madrid'))::date;
  v_expires := ((v_month + interval '1 month')::timestamp) AT TIME ZONE 'Europe/Madrid';
  SELECT id INTO v_synthetic_booking FROM public.bookings WHERE student_id = p_student_id ORDER BY created_at DESC LIMIT 1;
  IF v_synthetic_booking IS NULL THEN RAISE EXCEPTION 'NO_BOOKING_HISTORY'; END IF;
  -- Courtesy: explicit origin = grant month (synthetic source booking is not a real origin).
  INSERT INTO public.makeups (student_id, source_booking_id, expires_at, origin_month)
    VALUES (p_student_id, v_synthetic_booking, v_expires, v_month) RETURNING id INTO v_makeup_id;
  INSERT INTO public.admin_actions (admin_id, student_id, action_type, reason, metadata)
  VALUES (v_admin, p_student_id, 'grant_makeup', p_reason,
    jsonb_build_object('makeup_id', v_makeup_id, 'expires_at', v_expires, 'courtesy', true));
  RETURN v_makeup_id;
END;
$function$;