-- Bizum is a peer-to-peer transfer, not a card rail: students send the amount
-- directly to the studio's phone number, the same way cash works today. Drive
-- it through the same "reserve now, admin confirms later" path as cash instead
-- of routing it through Stripe Checkout (which confusingly showed a card form).

CREATE OR REPLACE FUNCTION public.pay_drop_in_bizum_batch(p_booking_ids uuid[])
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

  v_adult_total := CASE
    WHEN v_adults = 0 THEN 0
    WHEN v_adults = 1 THEN 3000
    WHEN v_adults = 2 THEN 5500
    WHEN v_adults = 3 THEN 7000
    WHEN v_adults = 4 THEN 8500
    ELSE 8500 + (v_adults - 4) * 2000
  END;
  v_adult_per_booking := CASE WHEN v_adults > 0 THEN round(v_adult_total::numeric / v_adults) ELSE 0 END;
  v_total := v_adult_total + v_kids * v_kids_per_booking;

  SELECT md5(array_to_string(array_agg(id ORDER BY id), ','))
  INTO v_dedup
  FROM unnest(p_booking_ids) AS id;
  v_key := 'bizum:' || v_dedup;

  FOREACH v_booking_id IN ARRAY p_booking_ids LOOP
    SELECT id, student_id, source, status, class_id INTO v_booking
      FROM public.bookings WHERE id = v_booking_id FOR UPDATE;

    IF EXISTS (SELECT 1 FROM public.payments WHERE booking_id = v_booking_id AND method = 'bizum') THEN
      CONTINUE;
    END IF;
    IF v_booking.status NOT IN ('reserved','confirmed') THEN
      RAISE EXCEPTION 'BOOKING_NOT_ACTIVE' USING errcode = '22023';
    END IF;

    SELECT audience INTO v_class FROM public.classes WHERE id = v_booking.class_id;

    INSERT INTO public.payments (student_id, booking_id, amount_cents, status, method, stripe_session_id)
      VALUES (v_student, v_booking_id,
        CASE WHEN v_class.audience = 'kids' THEN v_kids_per_booking ELSE v_adult_per_booking END,
        'pending', 'bizum', v_key);

    UPDATE public.bookings SET status = 'confirmed' WHERE id = v_booking_id AND status = 'reserved';

    SELECT v_classes || jsonb_build_object(
      'date', c.date,
      'start_time', c.start_time,
      'end_time', c.end_time,
      'teacher', c.teacher,
      'audience', c.audience
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
      'Clases', v_total, 'B', 'Pendiente',
      'Reserva con pago por Bizum al 627 093 463', v_key
    ) ON CONFLICT (stripe_session_id) DO NOTHING;

    PERFORM public.enqueue_notification(
      v_student, 'reservation_confirmed',
      jsonb_build_object('classes', v_classes, 'method', 'bizum'),
      v_dedup
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.pay_drop_in_bizum_batch(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_drop_in_bizum_batch(uuid[]) TO authenticated, service_role;

-- Mirrors purchase_plan_cash: reserves the month's subscription with a pending
-- Bizum payment the admin confirms once the transfer lands.
CREATE OR REPLACE FUNCTION public.purchase_plan_bizum(p_plan_id uuid, p_month date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_plan record;
  v_month date := public.resolve_plan_month(p_month);
  v_sub_id uuid;
BEGIN
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode = '28000'; END IF;

  SELECT id, price_cents, active INTO v_plan FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND OR v_plan.active IS NOT TRUE THEN
    RAISE EXCEPTION 'PLAN_NOT_AVAILABLE' USING errcode = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments p
      JOIN public.subscriptions s ON s.id = p.subscription_id
     WHERE p.student_id = v_student_id AND p.status = 'pending' AND p.method = 'bizum'
       AND s.plan_id = v_plan.id AND s.month = v_month
  ) THEN RETURN; END IF;

  INSERT INTO public.subscriptions (student_id, plan_id, month)
  VALUES (v_student_id, v_plan.id, v_month)
  ON CONFLICT (student_id, month) DO UPDATE SET plan_id = EXCLUDED.plan_id
  RETURNING id INTO v_sub_id;

  INSERT INTO public.payments (student_id, subscription_id, amount_cents, status, method)
  VALUES (v_student_id, v_sub_id, v_plan.price_cents, 'pending', 'bizum');

  PERFORM public.enqueue_notification(
    v_student_id, 'plan_purchased',
    jsonb_build_object('plan_id', v_plan.id, 'subscription_id', v_sub_id,
                       'method', 'bizum', 'month', to_char(v_month, 'YYYY-MM')),
    v_sub_id::text
  );
END;
$$;
REVOKE ALL ON FUNCTION public.purchase_plan_bizum(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_plan_bizum(uuid, date) TO authenticated, service_role;

-- admin_confirm_payment: treat manual "bizum:*" session keys the same way as
-- "cash:*" ones (skip the real Stripe confirmation path, sync the ledger row).
CREATE OR REPLACE FUNCTION public.admin_confirm_payment(p_payment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradoras pueden confirmar pagos';
  END IF;

  SELECT id, booking_id, status, student_id, stripe_session_id, method
    INTO v_payment
    FROM public.payments
    WHERE id = p_payment_id
    FOR UPDATE;
  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Pago no encontrado';
  END IF;
  IF v_payment.status = 'confirmed' THEN
    RETURN;
  END IF;

  IF v_payment.stripe_session_id IS NOT NULL
     AND v_payment.stripe_session_id NOT LIKE 'cash:%'
     AND v_payment.stripe_session_id NOT LIKE 'bizum:%' THEN
    PERFORM public.confirm_drop_in_booking(v_payment.stripe_session_id);
    RETURN;
  END IF;

  UPDATE public.payments SET status = 'confirmed' WHERE id = v_payment.id;
  IF v_payment.booking_id IS NOT NULL THEN
    UPDATE public.bookings SET status = 'confirmed'
      WHERE id = v_payment.booking_id AND status = 'reserved';
  END IF;

  IF v_payment.stripe_session_id LIKE 'cash:%' OR v_payment.stripe_session_id LIKE 'bizum:%' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.payments
       WHERE stripe_session_id = v_payment.stripe_session_id
         AND status <> 'confirmed'
    ) THEN
      UPDATE public.ledger_entries SET status = 'Pagado'
        WHERE stripe_session_id = v_payment.stripe_session_id;
    END IF;
  END IF;
END;
$function$;
