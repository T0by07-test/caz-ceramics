CREATE OR REPLACE FUNCTION public.makeup_billing_month(p_makeup uuid)
RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cur uuid := p_makeup; v_seen uuid[] := '{}'; v_m record; v_b record; v_parent uuid;
BEGIN
  LOOP
    IF v_cur IS NULL OR v_cur = ANY(v_seen) OR cardinality(v_seen) >= 50 THEN RETURN NULL; END IF;
    v_seen := v_seen || v_cur;
    SELECT id, source_booking_id, origin_month, expires_at INTO v_m FROM makeups WHERE id = v_cur;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM admin_actions a WHERE a.action_type = 'grant_makeup' AND a.metadata->>'makeup_id' = v_m.id::text) THEN RETURN public.makeup_origin_month(v_m.id); END IF;
    SELECT b.id, b.source, c.id AS class_id INTO v_b FROM bookings b JOIN classes c ON c.id = b.class_id WHERE b.id = v_m.source_booking_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF v_b.source = 'makeup' THEN
      v_parent := NULL;
      SELECT id INTO v_parent FROM makeups WHERE used_booking_id = v_b.id AND id <> v_m.id LIMIT 1;
      IF v_parent IS NULL THEN RETURN NULL; END IF;
      v_cur := v_parent;
    ELSE RETURN public.class_billing_month(v_b.class_id);
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.makeup_billing_month(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.makeup_billing_month(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.recalc_on_makeup_use()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.used_booking_id IS DISTINCT FROM OLD.used_booking_id THEN PERFORM public.recalc_month_pending_cash(NEW.student_id, public.makeup_billing_month(NEW.id)); END IF;
  RETURN NEW;
END $$;
DO $migration$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.quote_my_selection(uuid[],integer)'::regprocedure);
  n := replace(d, 'ORDER BY c.audience = ''kids'', c.date, c.start_time', 'ORDER BY c.audience = ''kids'', coalesce(c.billing_month, date_trunc(''month'', c.date)::date), c.date, c.start_time');
  IF n = d THEN RAISE EXCEPTION 'Unexpected quote_my_selection definition'; END IF;
  EXECUTE n;
  d := pg_get_functiondef('public.admin_move_booking(uuid,uuid,text)'::regprocedure);
  n := replace(d, '  SELECT count(*) INTO v_count', '  IF v_booking.source <> ''makeup'' AND public.class_billing_month(v_booking.class_id) IS DISTINCT FROM public.class_billing_month(p_target_class_id) THEN
    RAISE EXCEPTION ''CROSS_MONTH_MOVE'' USING errcode = ''22023'', hint = ''Estas clases cuentan para meses de tarifa distintos: cancela y reserva de nuevo.'';
  END IF;
  SELECT count(*) INTO v_count');
  IF n = d THEN RAISE EXCEPTION 'Unexpected admin_move_booking definition'; END IF;
  EXECUTE n;
  d := pg_get_functiondef('public.promote_waitlist(uuid)'::regprocedure);
  n := replace(d, 'v_month := date_trunc(''month'', v_class.date)::date;', 'v_month := public.class_billing_month(p_class_id);');
  IF n = d THEN RAISE EXCEPTION 'Unexpected promote_waitlist definition'; END IF;
  EXECUTE n;
  d := pg_get_functiondef('public.admin_confirm_payment(uuid)'::regprocedure);
  n := replace(d, 'AND status <> ''confirmed''', 'AND status = ''pending''');
  IF n = d THEN RAISE EXCEPTION 'Unexpected admin_confirm_payment definition'; END IF;
  EXECUTE n;
END $migration$;
CREATE OR REPLACE FUNCTION public.pay_drop_in_cash_batch(p_booking_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_student uuid := auth.uid(); v_id uuid; v_b record; v_amount int; v_classes jsonb := '[]'::jsonb;
  v_dedup text; v_key text; v_keys text[] := '{}'; v_name text; v_month date; r record;
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
BEGIN
  IF v_student IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode = '28000'; END IF;
  IF p_booking_ids IS NULL OR cardinality(p_booking_ids) = 0 THEN RAISE EXCEPTION 'NO_BOOKINGS' USING errcode = '22023'; END IF;
  FOR v_id IN SELECT DISTINCT id FROM unnest(p_booking_ids) id ORDER BY id LOOP
    SELECT id, student_id, source, status, class_id, guests INTO v_b FROM bookings WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING errcode = 'P0002'; END IF;
    IF v_b.student_id <> v_student THEN RAISE EXCEPTION 'NOT_OWNER' USING errcode = '42501'; END IF;
    IF v_b.source <> 'drop_in' THEN RAISE EXCEPTION 'INVALID_SOURCE' USING errcode = '22023'; END IF;
  END LOOP;
  SELECT md5(array_to_string(array_agg(DISTINCT id ORDER BY id), ',')) INTO v_dedup FROM unnest(p_booking_ids) id;
  FOR v_id, v_amount IN SELECT a.booking_id, a.amount_cents FROM public.drop_in_amounts(v_student, p_booking_ids) a LOOP
    SELECT id, status, class_id, guests INTO v_b FROM bookings WHERE id = v_id;
    IF EXISTS (SELECT 1 FROM payments WHERE booking_id = v_id AND status = 'confirmed' AND amount_cents > 0)
       OR EXISTS (SELECT 1 FROM payments WHERE booking_id = v_id AND method = 'cash' AND status <> 'void') THEN CONTINUE; END IF;
    IF v_b.status NOT IN ('reserved','confirmed') THEN RAISE EXCEPTION 'BOOKING_NOT_ACTIVE' USING errcode = '22023'; END IF;
    v_month := public.class_billing_month(v_b.class_id);
    v_key := 'cash:' || v_dedup || ':' || to_char(v_month, 'YYYY-MM');
    INSERT INTO payments (student_id, booking_id, amount_cents, status, method, stripe_session_id) VALUES (v_student, v_id, v_amount, 'pending', 'cash', v_key);
    IF NOT (v_key = ANY(v_keys)) THEN v_keys := v_keys || v_key; END IF;
    UPDATE bookings SET status = 'confirmed' WHERE id = v_id AND status = 'reserved';
    SELECT v_classes || jsonb_build_object('date', c.date, 'start_time', c.start_time, 'end_time', c.end_time, 'teacher', c.teacher, 'audience', c.audience, 'billing_month', v_month, 'guests', coalesce(v_b.guests, 0)) INTO v_classes FROM classes c WHERE c.id = v_b.class_id;
  END LOOP;
  IF jsonb_array_length(v_classes) > 0 THEN
    SELECT coalesce(nullif(trim(coalesce(name,'') || ' ' || coalesce(surname,'')), ''), email, 'Alumna') INTO v_name FROM profiles WHERE id = v_student;
    FOR r IN SELECT p.stripe_session_id, to_char(public.class_billing_month(b.class_id), 'YYYY-MM') AS billing_key, count(*) AS n, sum(p.amount_cents)::int AS cents,
       string_agg(c.date::text || ' ' || left(c.start_time::text, 5), ', ' ORDER BY c.date, c.start_time) AS dates
      FROM payments p JOIN bookings b ON b.id = p.booking_id JOIN classes c ON c.id = b.class_id
      WHERE p.stripe_session_id = ANY(v_keys) AND p.student_id = v_student
      GROUP BY p.stripe_session_id, to_char(public.class_billing_month(b.class_id), 'YYYY-MM')
    LOOP
      INSERT INTO ledger_entries (entry_date, month, student_name, item, category, amount_cents, method, status, notes, stripe_session_id)
        VALUES (v_today, r.billing_key, v_name, r.n || CASE WHEN r.n = 1 THEN ' clase' ELSE ' clases' END, 'Clases', r.cents, 'E', 'Pendiente', 'Reserva en efectivo: ' || r.dates, r.stripe_session_id)
        ON CONFLICT (stripe_session_id) DO NOTHING;
    END LOOP;
    PERFORM public.enqueue_notification(v_student, 'reservation_confirmed', jsonb_build_object('classes', v_classes, 'method', 'cash'), v_dedup);
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.pay_drop_in_cash(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN PERFORM public.pay_drop_in_cash_batch(ARRAY[p_booking_id]); END $$;
CREATE OR REPLACE FUNCTION public.record_drop_in_ledger(p_session_id text, p_entry_date date, p_method text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM ledger_entries WHERE stripe_session_id = p_session_id OR left(stripe_session_id, length(p_session_id) + 1) = p_session_id || ':') THEN RETURN; END IF;
  FOR r IN SELECT p.student_id, to_char(public.class_billing_month(b.class_id), 'YYYY-MM') AS billing_key, count(*) AS n, sum(p.amount_cents)::int AS cents,
      coalesce(nullif(trim(coalesce(pr.name,'') || ' ' || coalesce(pr.surname,'')), ''), pr.email, 'Alumna') AS student_name,
      string_agg(c.date::text || ' ' || left(c.start_time::text,5), ', ' ORDER BY c.date, c.start_time) AS dates
    FROM payments p JOIN bookings b ON b.id = p.booking_id JOIN classes c ON c.id = b.class_id JOIN profiles pr ON pr.id = p.student_id
    WHERE p.stripe_session_id = p_session_id AND p.status = 'confirmed' AND p.amount_cents > 0
    GROUP BY p.student_id, public.class_billing_month(b.class_id), pr.name, pr.surname, pr.email
  LOOP
    INSERT INTO ledger_entries (entry_date, month, student_name, item, category, amount_cents, method, status, notes, stripe_session_id)
      VALUES (p_entry_date, r.billing_key, r.student_name, r.n || CASE WHEN r.n = 1 THEN ' clase' ELSE ' clases' END, 'Clases', r.cents, CASE WHEN p_method = 'bizum' THEN 'B' ELSE 'T' END, 'Pagado', 'Cobro con Stripe: ' || r.dates, p_session_id || ':' || r.billing_key)
      ON CONFLICT (stripe_session_id) DO NOTHING;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.record_drop_in_ledger(text,date,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_drop_in_ledger(text,date,text) TO service_role;