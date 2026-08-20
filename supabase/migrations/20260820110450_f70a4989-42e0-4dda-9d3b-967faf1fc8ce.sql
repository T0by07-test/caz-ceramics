-- 1. Ledger idempotency key for Stripe-driven income rows
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS stripe_session_id text;
CREATE UNIQUE INDEX IF NOT EXISTS ledger_entries_stripe_session_id_key
  ON public.ledger_entries (stripe_session_id) WHERE stripe_session_id IS NOT NULL;

-- 2. Month resolver: current month, or next month only from day 20 onwards.
CREATE OR REPLACE FUNCTION public.resolve_plan_month(p_month date)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_current date := date_trunc('month', v_today)::date;
  v_next date := (date_trunc('month', v_today) + interval '1 month')::date;
  v_req date;
BEGIN
  IF p_month IS NULL THEN RETURN v_current; END IF;
  v_req := date_trunc('month', p_month)::date;
  IF v_req = v_current THEN RETURN v_current; END IF;
  IF v_req = v_next AND extract(day FROM v_today) >= 20 THEN RETURN v_next; END IF;
  RAISE EXCEPTION 'MONTH_NOT_ALLOWED' USING errcode = '22023';
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_plan_month(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_plan_month(date) TO authenticated, service_role;

-- 3. book_class: no more phantom 0 EUR payment row for drop-ins.
CREATE OR REPLACE FUNCTION public.book_class(p_class_id uuid, p_source text)
RETURNS TABLE(booking_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_student uuid := auth.uid();
  v_class record;
  v_existing record;
  v_count int;
  v_month date;
  v_has_plan boolean;
  v_new_status text;
  v_new_id uuid;
begin
  if v_student is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_source not in ('plan','drop_in') then
    raise exception 'INVALID_SOURCE' using errcode = '22023';
  end if;

  select id, date, start_time, status, capacity_max into v_class
    from public.classes where id = p_class_id for update;
  if not found then raise exception 'CLASS_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_class.status <> 'scheduled' then raise exception 'CLASS_NOT_SCHEDULED' using errcode = '22023'; end if;

  select id, status into v_existing
    from public.bookings
    where class_id = p_class_id and student_id = v_student
      and status in ('reserved','confirmed','attended')
    limit 1;
  if found then
    booking_id := v_existing.id; status := v_existing.status; return next; return;
  end if;

  select count(*) into v_count from public.bookings
    where class_id = p_class_id and status in ('reserved','confirmed','attended');
  if v_count >= v_class.capacity_max then raise exception 'CLASS_FULL' using errcode = '22023'; end if;

  if p_source = 'plan' then
    v_month := date_trunc('month', v_class.date)::date;
    select exists (select 1 from public.subscriptions where student_id = v_student and month = v_month)
      into v_has_plan;
    if not v_has_plan then raise exception 'NO_PLAN_THIS_MONTH' using errcode = '22023'; end if;
    v_new_status := 'confirmed';
  else
    v_new_status := 'reserved';
  end if;

  insert into public.bookings (student_id, class_id, source, status)
    values (v_student, p_class_id, p_source, v_new_status)
    returning id into v_new_id;

  booking_id := v_new_id; status := v_new_status; return next;
end;
$$;

-- 4. Cash payment for a single drop-in class: confirms the seat, payment stays pending.
CREATE OR REPLACE FUNCTION public.pay_drop_in_cash(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid := auth.uid();
  v_booking record;
BEGIN
  IF v_student IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode = '28000'; END IF;

  SELECT id, student_id, source, status INTO v_booking
    FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING errcode = 'P0002'; END IF;
  IF v_booking.student_id <> v_student THEN RAISE EXCEPTION 'NOT_OWNER' USING errcode = '42501'; END IF;
  IF v_booking.source <> 'drop_in' THEN RAISE EXCEPTION 'INVALID_SOURCE' USING errcode = '22023'; END IF;

  IF EXISTS (SELECT 1 FROM public.payments WHERE booking_id = p_booking_id AND method = 'cash') THEN
    RETURN;
  END IF;
  IF v_booking.status NOT IN ('reserved','confirmed') THEN
    RAISE EXCEPTION 'BOOKING_NOT_ACTIVE' USING errcode = '22023';
  END IF;

  INSERT INTO public.payments (student_id, booking_id, amount_cents, status, method)
    VALUES (v_student, p_booking_id, 2000, 'pending', 'cash');

  UPDATE public.bookings SET status = 'confirmed' WHERE id = p_booking_id AND status = 'reserved';

  PERFORM public.enqueue_notification(
    v_student, 'reservation_confirmed',
    jsonb_build_object('booking_id', p_booking_id, 'method', 'cash'),
    p_booking_id::text
  );
END;
$$;
REVOKE ALL ON FUNCTION public.pay_drop_in_cash(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_drop_in_cash(uuid) TO authenticated, service_role;

-- 5. expire_pending_drop_ins: only release seats with no confirmed card payment and no cash payment.
CREATE OR REPLACE FUNCTION public.expire_pending_drop_ins()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row record; v_count int := 0;
BEGIN
  FOR v_row IN
    SELECT b.id AS booking_id, b.class_id
      FROM public.bookings b
     WHERE b.source = 'drop_in'
       AND b.status = 'reserved'
       AND b.created_at < now() - interval '30 minutes'
       AND NOT EXISTS (
         SELECT 1 FROM public.payments p
          WHERE p.booking_id = b.id
            AND (p.status = 'confirmed' OR p.method = 'cash')
       )
  LOOP
    UPDATE public.bookings SET status = 'cancelled_lost', cancelled_at = now() WHERE id = v_row.booking_id;
    UPDATE public.payments SET status = 'failed'
      WHERE booking_id = v_row.booking_id AND status = 'pending';
    PERFORM public.promote_waitlist(v_row.class_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 6. Plan purchase for a chosen month (current, or next from day 20).
CREATE OR REPLACE FUNCTION public.grant_plan_subscription(
  p_session_id text, p_student_id uuid, p_plan_id uuid, p_month date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_payment record; v_plan record; v_month date; v_sub_id uuid;
BEGIN
  BEGIN
    v_month := public.resolve_plan_month(p_month);
  EXCEPTION WHEN others THEN
    v_month := date_trunc('month', (now() AT TIME ZONE 'Europe/Madrid'))::date;
  END;

  SELECT id, status INTO v_payment FROM public.payments
    WHERE stripe_session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_payment.status = 'confirmed' THEN RETURN; END IF;
  SELECT id INTO v_plan FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.subscriptions (student_id, plan_id, month)
  VALUES (p_student_id, v_plan.id, v_month)
  ON CONFLICT (student_id, month) DO UPDATE SET plan_id = EXCLUDED.plan_id
  RETURNING id INTO v_sub_id;

  UPDATE public.payments SET status = 'confirmed', subscription_id = v_sub_id WHERE id = v_payment.id;

  PERFORM public.enqueue_notification(
    p_student_id, 'plan_purchased',
    jsonb_build_object('plan_id', v_plan.id, 'subscription_id', v_sub_id,
                       'month', to_char(v_month, 'YYYY-MM')),
    v_sub_id::text
  );
END;
$$;
REVOKE ALL ON FUNCTION public.grant_plan_subscription(text, uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_plan_subscription(text, uuid, uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.purchase_plan_cash(p_plan_id uuid, p_month date DEFAULT NULL)
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
     WHERE p.student_id = v_student_id AND p.status = 'pending' AND p.method = 'cash'
       AND s.plan_id = v_plan.id AND s.month = v_month
  ) THEN RETURN; END IF;

  INSERT INTO public.subscriptions (student_id, plan_id, month)
  VALUES (v_student_id, v_plan.id, v_month)
  ON CONFLICT (student_id, month) DO UPDATE SET plan_id = EXCLUDED.plan_id
  RETURNING id INTO v_sub_id;

  INSERT INTO public.payments (student_id, subscription_id, amount_cents, status, method)
  VALUES (v_student_id, v_sub_id, v_plan.price_cents, 'pending', 'cash');

  PERFORM public.enqueue_notification(
    v_student_id, 'plan_purchased',
    jsonb_build_object('plan_id', v_plan.id, 'subscription_id', v_sub_id,
                       'method', 'cash', 'month', to_char(v_month, 'YYYY-MM')),
    v_sub_id::text
  );
END;
$$;
REVOKE ALL ON FUNCTION public.purchase_plan_cash(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_plan_cash(uuid, date) TO authenticated, service_role;

-- 7. Renewal reminder on the 1st for regular students without a plan this month.
CREATE OR REPLACE FUNCTION public.enqueue_plan_renewal_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month date := date_trunc('month', (now() AT TIME ZONE 'Europe/Madrid'))::date;
  v_prev date := (date_trunc('month', (now() AT TIME ZONE 'Europe/Madrid')) - interval '1 month')::date;
  v_count int := 0;
  v_row record;
BEGIN
  FOR v_row IN
    SELECT p.id
      FROM public.profiles p
     WHERE p.membership_status = 'active'
       AND (p.is_regular OR EXISTS (
             SELECT 1 FROM public.subscriptions s
              WHERE s.student_id = p.id AND s.month = v_prev))
       AND NOT EXISTS (
             SELECT 1 FROM public.subscriptions s2
              WHERE s2.student_id = p.id AND s2.month = v_month)
  LOOP
    PERFORM public.enqueue_notification(
      v_row.id, 'plan_renewal',
      jsonb_build_object('month', to_char(v_month, 'YYYY-MM')),
      to_char(v_month, 'YYYY-MM')
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_plan_renewal_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_plan_renewal_reminders() TO service_role;

-- 8. Cron cleanup: drop stale/duplicate jobs, keep one of each, add renewal reminder.
SELECT cron.unschedule(jobid) FROM cron.job
 WHERE jobid IN (1, 3, 4, 5);

SELECT cron.schedule(
  'plan-renewal-reminders',
  '0 8 1 * *',
  $cron$ SELECT public.enqueue_plan_renewal_reminders(); $cron$
);