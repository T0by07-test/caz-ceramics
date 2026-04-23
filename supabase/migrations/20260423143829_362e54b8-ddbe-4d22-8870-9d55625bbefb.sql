-- Route existing notification inserts through enqueue_notification so that
-- channel preferences (email/whatsapp/both) are honoured.
-- Business logic (booking flow, capacity, credits) is unchanged.

CREATE OR REPLACE FUNCTION public.promote_waitlist(p_class_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_class record;
  v_count int;
  v_entry record;
  v_subscription record;
  v_month date;
  v_status text;
  v_source text;
  v_booking_id uuid;
begin
  select id, date, status, capacity_max into v_class
    from public.classes
    where id = p_class_id
    for update;
  if not found or v_class.status <> 'scheduled' then
    return;
  end if;

  select count(*) into v_count
    from public.bookings
    where class_id = p_class_id
      and status in ('reserved','confirmed','attended');
  if v_count >= v_class.capacity_max then
    return;
  end if;

  select id, student_id, position into v_entry
    from public.waitlist
    where class_id = p_class_id
    order by position asc
    limit 1
    for update;
  if not found then
    return;
  end if;

  v_month := date_trunc('month', v_class.date)::date;
  select id, credits_remaining into v_subscription
    from public.subscriptions
    where student_id = v_entry.student_id
      and month = v_month
    for update;

  if found and v_subscription.credits_remaining > 0 then
    update public.subscriptions
      set credits_remaining = credits_remaining - 1
      where id = v_subscription.id;
    v_status := 'confirmed';
    v_source := 'plan';
  else
    v_status := 'reserved';
    v_source := 'drop_in';
  end if;

  insert into public.bookings (student_id, class_id, source, status)
    values (v_entry.student_id, p_class_id, v_source, v_status)
    returning id into v_booking_id;

  if v_source = 'drop_in' then
    insert into public.payments (student_id, booking_id, amount_cents, status)
      values (v_entry.student_id, v_booking_id, 0, 'pending');
  end if;

  delete from public.waitlist where id = v_entry.id;

  perform public.enqueue_notification(
    v_entry.student_id,
    'waitlist_promoted',
    jsonb_build_object(
      'class_id', p_class_id,
      'booking_id', v_booking_id,
      'requires_payment', (v_source = 'drop_in')
    ),
    v_booking_id::text
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_drop_in_booking(p_session_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_payment record; v_booking record;
BEGIN
  SELECT id, booking_id, status, student_id INTO v_payment
    FROM public.payments WHERE stripe_session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_payment.status = 'confirmed' THEN RETURN; END IF;
  UPDATE public.payments SET status = 'confirmed' WHERE id = v_payment.id;
  IF v_payment.booking_id IS NULL THEN RETURN; END IF;
  SELECT id, status INTO v_booking FROM public.bookings WHERE id = v_payment.booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_booking.status = 'reserved' THEN
    UPDATE public.bookings SET status = 'confirmed' WHERE id = v_booking.id;
    PERFORM public.enqueue_notification(
      v_payment.student_id,
      'reservation_confirmed',
      jsonb_build_object('booking_id', v_booking.id),
      v_booking.id::text
    );
  END IF;
END;$function$;

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
  SELECT id, classes_per_month INTO v_plan FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.subscriptions (student_id, plan_id, month, credits_total, credits_remaining)
  VALUES (p_student_id, v_plan.id, v_month, v_plan.classes_per_month, v_plan.classes_per_month)
  ON CONFLICT (student_id, month) DO UPDATE
    SET plan_id = EXCLUDED.plan_id,
        credits_total = public.subscriptions.credits_total + EXCLUDED.credits_total,
        credits_remaining = public.subscriptions.credits_remaining + EXCLUDED.credits_remaining
  RETURNING id INTO v_sub_id;
  UPDATE public.payments SET status = 'confirmed', subscription_id = v_sub_id WHERE id = v_payment.id;
  PERFORM public.enqueue_notification(
    p_student_id,
    'plan_purchased',
    jsonb_build_object('plan_id', v_plan.id, 'subscription_id', v_sub_id),
    v_sub_id::text
  );
END;$function$;

CREATE OR REPLACE FUNCTION public.auto_cancel_low_attendance()
 RETURNS TABLE(cancelled_class_id uuid, affected_bookings integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_class record;
  v_count int;
  v_now timestamptz := now();
  v_start_madrid timestamptz;
  v_expires_at timestamptz;
  v_affected int;
  v_aff record;
begin
  for v_class in
    select id, date, start_time
      from public.classes
      where status = 'scheduled'
  loop
    v_start_madrid := ((v_class.date::text || ' ' || v_class.start_time::text)::timestamp)
                      at time zone 'Europe/Madrid';
    if v_start_madrid < v_now or v_start_madrid > v_now + interval '24 hours' then
      continue;
    end if;

    select count(*) into v_count
      from public.bookings
      where class_id = v_class.id
        and status in ('reserved','confirmed','attended');
    if v_count >= 3 then
      continue;
    end if;

    update public.classes set status = 'auto_cancelled' where id = v_class.id;

    v_expires_at := ((date_trunc('month', v_class.date) + interval '1 month' - interval '1 day')::date::text
                     || ' 23:59:00')::timestamp at time zone 'Europe/Madrid';

    v_affected := 0;
    for v_aff in
      update public.bookings
         set status = 'cancelled_recoverable',
             cancelled_at = v_now
       where class_id = v_class.id
         and status in ('reserved','confirmed','attended')
       returning id, student_id
    loop
      insert into public.makeups (student_id, source_booking_id, expires_at)
        values (v_aff.student_id, v_aff.id, v_expires_at);
      perform public.enqueue_notification(
        v_aff.student_id,
        'class_cancelled',
        jsonb_build_object('class_id', v_class.id, 'reason', 'low_attendance'),
        v_class.id::text
      );
      v_affected := v_affected + 1;
    end loop;

    cancelled_class_id := v_class.id;
    affected_bookings := v_affected;
    return next;
  end loop;
end;
$function$;