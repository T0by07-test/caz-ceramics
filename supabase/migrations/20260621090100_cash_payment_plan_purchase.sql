-- Cash payment support for plan purchases (Efectivo).
-- (a) Adds payments.method text (nullable; values: 'card' | 'bizum' | 'cash'). No CHECK
--     constraint so existing inserts that omit method keep working.
-- (b) Adds purchase_plan_cash(p_plan_id uuid): activates the current-month subscription
--     immediately (granting credits, modelled exactly on grant_plan_subscription) and
--     records a pending cash payment. SECURITY DEFINER, uses auth.uid().

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS method text;

CREATE OR REPLACE FUNCTION public.purchase_plan_cash(p_plan_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_plan record;
  v_month date := date_trunc('month', (now() AT TIME ZONE 'Europe/Madrid'))::date;
  v_sub_id uuid;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, classes_per_month, price_cents, active INTO v_plan
    FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND OR v_plan.active IS NOT TRUE THEN
    RAISE EXCEPTION 'Plan not found or inactive';
  END IF;

  -- Guard: do not create a duplicate pending cash payment for the same plan/month.
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

  -- Credit/subscription logic modelled exactly on grant_plan_subscription.
  INSERT INTO public.subscriptions (student_id, plan_id, month, credits_total, credits_remaining)
  VALUES (v_student_id, v_plan.id, v_month, v_plan.classes_per_month, v_plan.classes_per_month)
  ON CONFLICT (student_id, month) DO UPDATE
    SET plan_id = EXCLUDED.plan_id,
        credits_total = public.subscriptions.credits_total + EXCLUDED.credits_total,
        credits_remaining = public.subscriptions.credits_remaining + EXCLUDED.credits_remaining
  RETURNING id INTO v_sub_id;

  INSERT INTO public.payments (student_id, subscription_id, amount_cents, status, method)
  VALUES (v_student_id, v_sub_id, v_plan.price_cents, 'pending', 'cash');

  PERFORM public.enqueue_notification(
    v_student_id,
    'plan_purchased',
    jsonb_build_object('plan_id', v_plan.id, 'subscription_id', v_sub_id, 'method', 'cash'),
    v_sub_id::text
  );
END;$$;

GRANT EXECUTE ON FUNCTION public.purchase_plan_cash(uuid) TO authenticated;
