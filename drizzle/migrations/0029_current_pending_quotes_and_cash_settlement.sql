CREATE OR REPLACE FUNCTION public.current_pending_booking_amounts(p_student uuid, p_booking_ids uuid[])
RETURNS TABLE(booking_id uuid, amount_cents integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; v_ids uuid[];
BEGIN
  FOR r IN SELECT DISTINCT public.class_billing_month(b.class_id) m FROM bookings b WHERE b.id = ANY(p_booking_ids) AND b.student_id = p_student
  LOOP
    SELECT array_agg(b.id) INTO v_ids FROM bookings b
    WHERE b.student_id = p_student AND public.class_billing_month(b.class_id) = r.m
      AND b.source = 'drop_in' AND b.status IN ('reserved','confirmed','attended')
      AND EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.status = 'pending' AND (p.amount_cents > 0 OR p.method = 'cash'))
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.status = 'confirmed' AND p.amount_cents > 0);
    IF v_ids IS NULL THEN CONTINUE; END IF;
    RETURN QUERY SELECT a.booking_id,
      coalesce((SELECT p.amount_cents FROM payments p WHERE p.booking_id = a.booking_id AND p.status = 'pending' AND p.method = 'cash' ORDER BY p.created_at DESC, p.id LIMIT 1), a.amount_cents)::integer
      FROM public.drop_in_amounts(p_student, v_ids) a WHERE a.booking_id = ANY(p_booking_ids);
  END LOOP;
END $function$;
REVOKE ALL ON FUNCTION public.current_pending_booking_amounts(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_pending_booking_amounts(uuid, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.pending_booking_amounts(p_booking_ids uuid[])
RETURNS TABLE(booking_id uuid, amount_cents integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid(); r record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode = '28000'; END IF;
  IF EXISTS (SELECT 1 FROM bookings b WHERE b.id = ANY(p_booking_ids) AND b.student_id <> v_user) AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'NOT_OWNER' USING errcode = '42501';
  END IF;
  FOR r IN SELECT DISTINCT b.student_id FROM bookings b WHERE b.id = ANY(p_booking_ids)
  LOOP
    RETURN QUERY SELECT a.booking_id, a.amount_cents FROM public.current_pending_booking_amounts(r.student_id, p_booking_ids) a;
  END LOOP;
END $function$;
REVOKE ALL ON FUNCTION public.pending_booking_amounts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pending_booking_amounts(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.warn_expiring_drop_in_holds()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row record; v_count int := 0;
BEGIN
  FOR v_row IN
    SELECT b.student_id,
      jsonb_agg(jsonb_build_object('date',c.date,'start_time',c.start_time,'end_time',c.end_time,'teacher',c.teacher,'audience',c.audience) ORDER BY c.date) AS classes,
      coalesce(sum((SELECT a.amount_cents FROM public.current_pending_booking_amounts(b.student_id, ARRAY[b.id]) a)),0) AS amount_cents,
      min(b.created_at) AS first_created
    FROM public.bookings b JOIN public.classes c ON c.id=b.class_id
    WHERE b.source='drop_in' AND b.status='reserved'
      AND b.created_at < now() - interval '120 minutes' AND b.created_at > now() - interval '180 minutes'
      AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id=b.id AND (p.status='confirmed' OR p.method IN ('cash','bizum')))
      AND NOT EXISTS (SELECT 1 FROM public.payments p2 WHERE p2.student_id=b.student_id AND p2.status='confirmed' AND p2.amount_cents>0 AND p2.created_at > b.created_at - interval '7 days')
    GROUP BY b.student_id
  LOOP
    PERFORM public.enqueue_notification(v_row.student_id,'payment_hold_warning',jsonb_build_object('classes',v_row.classes,'amount_cents',v_row.amount_cents),to_char(v_row.first_created,'YYYYMMDDHH24MI'));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $function$;

CREATE OR REPLACE FUNCTION public.expire_pending_drop_ins()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row record; v_count int := 0; v_admin record;
BEGIN
  FOR v_row IN
    SELECT b.id AS booking_id,b.class_id,b.student_id,c.date,c.start_time,c.end_time,c.teacher,c.audience,
      (SELECT a.amount_cents FROM public.current_pending_booking_amounts(b.student_id, ARRAY[b.id]) a) AS amount_cents,
      coalesce(nullif(trim(coalesce(pr.name,'') || ' ' || coalesce(pr.surname,'')),''),pr.email,'—') AS student_name
    FROM public.bookings b JOIN public.classes c ON c.id=b.class_id LEFT JOIN public.profiles pr ON pr.id=b.student_id
    WHERE b.source='drop_in' AND b.status='reserved' AND b.created_at < now() - interval '180 minutes'
      AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id=b.id AND (p.status='confirmed' OR p.method IN ('cash','bizum')))
      AND NOT EXISTS (SELECT 1 FROM public.payments p2 WHERE p2.student_id=b.student_id AND p2.status='confirmed' AND p2.amount_cents>0 AND p2.created_at > b.created_at - interval '7 days')
  LOOP
    UPDATE public.bookings SET status='cancelled_lost',cancelled_at=now() WHERE id=v_row.booking_id;
    UPDATE public.payments SET status='failed' WHERE booking_id=v_row.booking_id AND status='pending';
    IF v_row.audience <> 'kids' THEN PERFORM public.recalc_month_pending_cash(v_row.student_id,public.class_billing_month(v_row.class_id)); END IF;
    PERFORM public.promote_waitlist(v_row.class_id);
    PERFORM public.enqueue_notification(v_row.student_id,'booking_released_unpaid',jsonb_build_object('date',v_row.date,'start_time',v_row.start_time,'end_time',v_row.end_time,'teacher',v_row.teacher,'audience',v_row.audience,'amount_cents',v_row.amount_cents),v_row.booking_id::text);
    FOR v_admin IN SELECT id FROM public.profiles WHERE role='admin' AND email IS NOT NULL LOOP
      PERFORM public.enqueue_notification(v_admin.id,'admin_booking_released_unpaid',jsonb_build_object('student_name',v_row.student_name,'date',v_row.date,'start_time',v_row.start_time,'end_time',v_row.end_time,'teacher',v_row.teacher,'audience',v_row.audience,'amount_cents',v_row.amount_cents),v_row.booking_id::text);
    END LOOP;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $function$;

CREATE OR REPLACE FUNCTION public.confirm_drop_in_booking(p_session_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_payment record; v_booking record; v_new_bookings uuid[] := '{}'; v_student uuid; v_classes jsonb;
  v_active_count int; v_capacity_max int; v_cash_session record; v_month record;
BEGIN
  FOR v_payment IN SELECT id,booking_id,status,student_id FROM public.payments WHERE stripe_session_id=p_session_id FOR UPDATE
  LOOP
    IF v_payment.status='confirmed' THEN CONTINUE; END IF;
    UPDATE public.payments SET status='confirmed' WHERE id=v_payment.id;
    IF v_payment.booking_id IS NULL THEN CONTINUE; END IF;
    FOR v_cash_session IN SELECT DISTINCT stripe_session_id FROM public.payments WHERE booking_id=v_payment.booking_id AND id<>v_payment.id AND status='pending' AND method='cash'
    LOOP
      UPDATE public.payments SET status='failed' WHERE booking_id=v_payment.booking_id AND id<>v_payment.id AND status='pending' AND method='cash' AND stripe_session_id IS NOT DISTINCT FROM v_cash_session.stripe_session_id;
      PERFORM public.sync_cash_ledger(v_cash_session.stripe_session_id);
    END LOOP;
    UPDATE public.payments SET status='failed' WHERE booking_id=v_payment.booking_id AND id<>v_payment.id AND status='pending';
    SELECT id,class_id,status,guests INTO v_booking FROM public.bookings WHERE id=v_payment.booking_id FOR UPDATE;
    IF v_booking.status='reserved' THEN
      UPDATE public.bookings SET status='confirmed' WHERE id=v_booking.id;
      v_new_bookings := array_append(v_new_bookings,v_booking.id); v_student := v_payment.student_id;
    ELSIF v_booking.status='cancelled_lost' THEN
      SELECT capacity_max INTO v_capacity_max FROM public.classes WHERE id=v_booking.class_id;
      SELECT coalesce(sum(1+b.guests),0)::int INTO v_active_count FROM public.bookings b WHERE b.class_id=v_booking.class_id AND b.status IN ('reserved','confirmed','attended');
      IF v_active_count+1+coalesce(v_booking.guests,0)<=v_capacity_max THEN
        UPDATE public.bookings SET status='confirmed',cancelled_at=NULL WHERE id=v_booking.id;
        v_new_bookings := array_append(v_new_bookings,v_booking.id); v_student := v_payment.student_id;
      END IF;
    END IF;
  END LOOP;
  FOR v_month IN SELECT DISTINCT p.student_id,public.class_billing_month(b.class_id) m FROM public.payments p JOIN public.bookings b ON b.id=p.booking_id JOIN public.classes c ON c.id=b.class_id WHERE p.stripe_session_id=p_session_id AND c.audience<>'kids'
  LOOP
    PERFORM public.recalc_month_pending_cash(v_month.student_id,v_month.m);
  END LOOP;
  IF array_length(v_new_bookings,1) IS NOT NULL AND v_student IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('date',c.date,'start_time',c.start_time,'end_time',c.end_time,'teacher',c.teacher,'audience',c.audience,'guests',coalesce(b.guests,0)) ORDER BY c.date,c.start_time),'[]'::jsonb)
    INTO v_classes FROM public.bookings b JOIN public.classes c ON c.id=b.class_id WHERE b.id=ANY(v_new_bookings);
    IF jsonb_array_length(v_classes)>0 THEN PERFORM public.enqueue_notification(v_student,'reservation_confirmed',jsonb_build_object('classes',v_classes),p_session_id); END IF;
  END IF;
END $function$;