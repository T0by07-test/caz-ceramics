ALTER TABLE public.subscriptions DROP COLUMN credits_total, DROP COLUMN credits_remaining;

CREATE OR REPLACE FUNCTION public.grant_plan_subscription(p_session_id text, p_student_id uuid, p_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_payment record; v_plan record;
        v_month date := date_trunc('month', (now() AT TIME ZONE 'Europe/Madrid'))::date;
        v_sub_id uuid;
BEGIN
  SELECT id, status INTO v_payment FROM public.payments
    WHERE stripe_session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_payment.status = 'confirmed' THEN RETURN; END IF;
  SELECT id INTO v_plan FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.subscriptions (student_id, plan_id, month)
  VALUES (p_student_id, v_plan.id, v_month)
  ON CONFLICT (student_id, month) DO UPDATE
    SET plan_id = EXCLUDED.plan_id
  RETURNING id INTO v_sub_id;
  UPDATE public.payments SET status = 'confirmed', subscription_id = v_sub_id WHERE id = v_payment.id;
  PERFORM public.enqueue_notification(
    p_student_id,
    'plan_purchased',
    jsonb_build_object('plan_id', v_plan.id, 'subscription_id', v_sub_id),
    v_sub_id::text
  );
END;$function$;

CREATE OR REPLACE FUNCTION public.purchase_plan_cash(p_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_plan record;
  v_month date := date_trunc('month', (now() AT TIME ZONE 'Europe/Madrid'))::date;
  v_sub_id uuid;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, price_cents, active INTO v_plan
    FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND OR v_plan.active IS NOT TRUE THEN
    RAISE EXCEPTION 'Plan not found or inactive';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.payments p
      JOIN public.subscriptions s ON s.id = p.subscription_id
     WHERE p.student_id = v_student_id
       AND p.status = 'pending'
       AND p.method = 'cash'
       AND s.plan_id = v_plan.id
       AND s.month = v_month
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.subscriptions (student_id, plan_id, month)
  VALUES (v_student_id, v_plan.id, v_month)
  ON CONFLICT (student_id, month) DO UPDATE
    SET plan_id = EXCLUDED.plan_id
  RETURNING id INTO v_sub_id;

  INSERT INTO public.payments (student_id, subscription_id, amount_cents, status, method)
  VALUES (v_student_id, v_sub_id, v_plan.price_cents, 'pending', 'cash');

  PERFORM public.enqueue_notification(
    v_student_id,
    'plan_purchased',
    jsonb_build_object('plan_id', v_plan.id, 'subscription_id', v_sub_id, 'method', 'cash'),
    v_sub_id::text
  );
END;$function$;

CREATE OR REPLACE FUNCTION public.enqueue_monthly_summary()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month date := date_trunc('month', (now() AT TIME ZONE 'Europe/Madrid'))::date;
  v_count int := 0;
  v_row record;
  v_makeups_pending int;
  v_booked int;
  v_attended int;
BEGIN
  FOR v_row IN
    SELECT s.student_id
      FROM public.subscriptions s
     WHERE s.month = v_month
  LOOP
    SELECT count(*) INTO v_makeups_pending
      FROM public.makeups
     WHERE student_id = v_row.student_id
       AND used_booking_id IS NULL
       AND expires_at > now();

    SELECT count(*) FILTER (WHERE b.status IN ('reserved','confirmed','attended')),
           count(*) FILTER (WHERE b.status = 'attended')
      INTO v_booked, v_attended
      FROM public.bookings b
      JOIN public.classes c ON c.id = b.class_id
     WHERE b.student_id = v_row.student_id
       AND date_trunc('month', c.date)::date = v_month;

    PERFORM public.enqueue_notification(
      v_row.student_id,
      'monthly_summary',
      jsonb_build_object(
        'month', to_char(v_month, 'YYYY-MM'),
        'classes_booked', coalesce(v_booked, 0),
        'classes_attended', coalesce(v_attended, 0),
        'makeups_pending', v_makeups_pending
      ),
      to_char(v_month, 'YYYY-MM')
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
 RETURNS TABLE(booking_id uuid, status text, makeup_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student uuid := auth.uid();
  v_booking record;
  v_class record;
  v_start_madrid timestamptz;
  v_now timestamptz := now();
  v_recoverable boolean;
  v_new_status text;
  v_existing_makeup uuid;
  v_makeup uuid;
  v_expires_at timestamptz;
  v_class_id uuid;
begin
  if v_student is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select id, student_id, class_id, status
    into v_booking
    from public.bookings
    where id = p_booking_id
    for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.student_id <> v_student then
    raise exception 'NOT_OWNER' using errcode = '42501';
  end if;

  if v_booking.status in ('cancelled_recoverable','cancelled_lost') then
    select id into v_existing_makeup
      from public.makeups
      where source_booking_id = v_booking.id
      limit 1;
    booking_id := v_booking.id;
    status := v_booking.status;
    makeup_id := v_existing_makeup;
    return next;
    return;
  end if;

  select date, start_time into v_class
    from public.classes
    where id = v_booking.class_id;
  if not found then
    raise exception 'CLASS_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_start_madrid := ((v_class.date::text || ' ' || v_class.start_time::text)::timestamp)
                    at time zone 'Europe/Madrid';
  v_recoverable := v_now < (v_start_madrid - interval '12 hours');
  v_new_status := case when v_recoverable then 'cancelled_recoverable' else 'cancelled_lost' end;

  update public.bookings
     set status = v_new_status,
         cancelled_at = v_now
   where id = v_booking.id;

  if v_recoverable then
    v_expires_at := ((date_trunc('month', v_class.date) + interval '1 month' - interval '1 day')::date::text
                     || ' 23:59:00')::timestamp at time zone 'Europe/Madrid';
    insert into public.makeups (student_id, source_booking_id, expires_at)
      values (v_student, v_booking.id, v_expires_at)
      returning id into v_makeup;
  end if;

  v_class_id := v_booking.class_id;
  perform public.promote_waitlist(v_class_id);

  booking_id := v_booking.id;
  status := v_new_status;
  makeup_id := v_makeup;
  return next;
end;
$function$;