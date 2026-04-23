-- 0) Clean previous duplicates: assign stripe_price_id to existing rows by classes_per_month, deactivate extras
WITH ranked AS (
  SELECT id, classes_per_month,
         row_number() OVER (PARTITION BY classes_per_month ORDER BY created_at) AS rn
    FROM public.plans
)
UPDATE public.plans p
   SET stripe_price_id = CASE r.classes_per_month
                           WHEN 1 THEN 'plan_1_class_month'
                           WHEN 2 THEN 'plan_2_classes_month'
                           WHEN 3 THEN 'plan_3_classes_month'
                           WHEN 4 THEN 'plan_4_classes_month'
                           ELSE p.stripe_price_id
                         END,
       price_cents = CASE r.classes_per_month
                       WHEN 1 THEN 3500
                       WHEN 2 THEN 6500
                       WHEN 3 THEN 9000
                       WHEN 4 THEN 11000
                       ELSE p.price_cents
                     END,
       name = CASE r.classes_per_month
                WHEN 1 THEN 'Plan 1 clase / mes'
                WHEN 2 THEN 'Plan 2 clases / mes'
                WHEN 3 THEN 'Plan 3 clases / mes'
                WHEN 4 THEN 'Plan 4 clases / mes'
                ELSE p.name
              END,
       active = (r.rn = 1)
  FROM ranked r
 WHERE p.id = r.id
   AND r.classes_per_month BETWEEN 1 AND 4;

-- Insert any plan tiers that don't yet exist
INSERT INTO public.plans (name, classes_per_month, price_cents, stripe_price_id, active)
SELECT v.name, v.cpm, v.price, v.spi, true
  FROM (VALUES
    ('Plan 1 clase / mes',  1,  3500, 'plan_1_class_month'),
    ('Plan 2 clases / mes', 2,  6500, 'plan_2_classes_month'),
    ('Plan 3 clases / mes', 3,  9000, 'plan_3_classes_month'),
    ('Plan 4 clases / mes', 4, 11000, 'plan_4_classes_month')
  ) AS v(name, cpm, price, spi)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.plans p WHERE p.classes_per_month = v.cpm AND p.active = true
 );

-- Now safe to add the constraint, after deduping any remaining empties
UPDATE public.plans SET stripe_price_id = 'legacy_' || id::text
 WHERE stripe_price_id IS NULL OR stripe_price_id = '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_stripe_price_id_unique') THEN
    ALTER TABLE public.plans ADD CONSTRAINT plans_stripe_price_id_unique UNIQUE (stripe_price_id);
  END IF;
END$$;

-- Subscriptions unique (student, month) for upsert
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_student_month_unique') THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_student_month_unique UNIQUE (student_id, month);
  END IF;
END$$;

-- Payments stripe_session_id unique for idempotency
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_stripe_session_unique') THEN
    -- Allow nulls (existing rows with no session) but unique when present
    CREATE UNIQUE INDEX payments_stripe_session_unique
      ON public.payments (stripe_session_id)
      WHERE stripe_session_id IS NOT NULL;
  END IF;
END$$;

-- Functions
CREATE OR REPLACE FUNCTION public.confirm_drop_in_booking(p_session_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
    INSERT INTO public.notifications (student_id, type, channel, payload, status)
    VALUES (v_payment.student_id, 'reservation_confirmed', 'email',
            jsonb_build_object('booking_id', v_booking.id), 'queued');
  END IF;
END;$$;

CREATE OR REPLACE FUNCTION public.grant_plan_subscription(p_session_id text, p_student_id uuid, p_plan_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  INSERT INTO public.notifications (student_id, type, channel, payload, status)
  VALUES (p_student_id, 'plan_purchased', 'email',
          jsonb_build_object('plan_id', v_plan.id, 'subscription_id', v_sub_id), 'queued');
END;$$;

CREATE OR REPLACE FUNCTION public.fail_payment(p_session_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_payment record; v_booking record; v_class_id uuid;
BEGIN
  SELECT id, booking_id, status INTO v_payment FROM public.payments
    WHERE stripe_session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_payment.status IN ('failed','confirmed') THEN RETURN; END IF;
  UPDATE public.payments SET status = 'failed' WHERE id = v_payment.id;
  IF v_payment.booking_id IS NULL THEN RETURN; END IF;
  SELECT id, status, class_id INTO v_booking FROM public.bookings
    WHERE id = v_payment.booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_booking.status = 'reserved' THEN
    UPDATE public.bookings SET status = 'cancelled_lost', cancelled_at = now() WHERE id = v_booking.id;
    v_class_id := v_booking.class_id;
    PERFORM public.promote_waitlist(v_class_id);
  END IF;
END;$$;

CREATE OR REPLACE FUNCTION public.expire_pending_drop_ins()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row record; v_count int := 0;
BEGIN
  FOR v_row IN
    SELECT b.id AS booking_id, b.class_id, p.id AS payment_id
      FROM public.bookings b
      JOIN public.payments p ON p.booking_id = b.id
     WHERE b.source = 'drop_in' AND b.status = 'reserved'
       AND p.status = 'pending'
       AND b.created_at < now() - interval '30 minutes'
  LOOP
    UPDATE public.bookings SET status = 'cancelled_lost', cancelled_at = now() WHERE id = v_row.booking_id;
    UPDATE public.payments  SET status = 'failed' WHERE id = v_row.payment_id;
    PERFORM public.promote_waitlist(v_row.class_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;$$;

-- Cron schedule (every 5 minutes)
DO $$ BEGIN PERFORM cron.unschedule('expire-pending-drop-ins'); EXCEPTION WHEN others THEN NULL; END $$;
SELECT cron.schedule('expire-pending-drop-ins', '*/5 * * * *',
  $cron$ SELECT public.expire_pending_drop_ins(); $cron$);