ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_status_check;
ALTER TABLE public.classes ADD CONSTRAINT classes_status_check
  CHECK (status = ANY (ARRAY['scheduled','auto_cancelled','cancelled_by_admin','cancelled']));

CREATE OR REPLACE FUNCTION public.admin_cancel_class(p_class_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_class record; v_month date; v_affected int := 0; v_aff record; v_session text;
  v_start timestamptz;
BEGIN
  IF NOT public.can_manage_classes() THEN
    RAISE EXCEPTION 'NOT_ADMIN' USING errcode = '42501';
  END IF;
  SELECT id, date, start_time, audience, status INTO v_class
    FROM public.classes WHERE id = p_class_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLASS_NOT_FOUND' USING errcode = 'P0002'; END IF;
  -- Idempotent: already really cancelled (by this action or the automatic one).
  IF v_class.status IN ('cancelled','auto_cancelled') THEN RETURN 0; END IF;
  v_start := ((v_class.date::text || ' ' || v_class.start_time::text)::timestamp) AT TIME ZONE 'Europe/Madrid';
  IF v_start < now() THEN
    RAISE EXCEPTION 'CLASS_IN_PAST' USING errcode = '22023',
      hint = 'No se pueden cancelar clases que ya han empezado o pasado.';
  END IF;

  UPDATE public.classes SET status = 'cancelled' WHERE id = v_class.id;
  v_month := date_trunc('month', v_class.date)::date;

  FOR v_aff IN
    UPDATE public.bookings SET status = 'cancelled_recoverable', cancelled_at = now()
     WHERE class_id = v_class.id AND status IN ('reserved','confirmed','attended')
     RETURNING id, student_id, source
  LOOP
    IF v_aff.source = 'makeup' THEN
      UPDATE public.makeups SET used_booking_id = NULL WHERE used_booking_id = v_aff.id;
    ELSIF NOT EXISTS (SELECT 1 FROM public.makeups WHERE source_booking_id = v_aff.id) THEN
      INSERT INTO public.makeups (student_id, source_booking_id, expires_at, origin_month)
        VALUES (v_aff.student_id, v_aff.id,
                ((v_month + interval '1 month')::timestamp) AT TIME ZONE 'Europe/Madrid', v_month);
    END IF;
    v_session := NULL;
    SELECT p.stripe_session_id INTO v_session FROM public.payments p
      WHERE p.booking_id = v_aff.id AND p.status = 'pending' AND p.amount_cents > 0 LIMIT 1;
    UPDATE public.payments SET status = 'failed' WHERE booking_id = v_aff.id AND status = 'pending';
    IF v_aff.source = 'drop_in' AND v_class.audience <> 'kids' THEN
      PERFORM public.recalc_month_pending_cash(v_aff.student_id, v_class.date);
    END IF;
    PERFORM public.sync_cash_ledger(v_session);
    PERFORM public.enqueue_notification(v_aff.student_id, 'class_cancelled',
      jsonb_build_object('class_id', v_class.id, 'reason', 'studio_cancelled'), v_class.id::text);
    v_affected := v_affected + 1;
  END LOOP;

  DELETE FROM public.waitlist WHERE class_id = v_class.id;

  INSERT INTO public.admin_actions (admin_id, student_id, action_type, reason, metadata)
  VALUES (auth.uid(), NULL, 'cancel_class', 'Clase cancelada por el estudio',
          jsonb_build_object('class_id', v_class.id, 'affected_bookings', v_affected));
  RETURN v_affected;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_cancel_class(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_class(uuid) TO authenticated, service_role;