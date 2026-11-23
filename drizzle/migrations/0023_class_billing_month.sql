ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS billing_month date;
COMMENT ON COLUMN public.classes.billing_month IS 'Optional first day of the month whose adult tier this class counts toward; null = month of date';

CREATE OR REPLACE FUNCTION public.class_billing_month(p_class_id uuid)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(billing_month, date_trunc('month', date)::date) FROM public.classes WHERE id = p_class_id
$$;
GRANT EXECUTE ON FUNCTION public.class_billing_month(uuid) TO authenticated, service_role;

DO $do$
DECLARE r record; d text; n text;
BEGIN
  FOR r IN SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname IN ('enqueue_monthly_summary','prior_adult_seats','prior_adult_slot_seats','recalc_month_pending_cash','drop_in_amounts','quote_my_selection','admin_cancel_class','auto_cancel_low_attendance','admin_remove_booking','cancel_booking')
  LOOP
    d := pg_get_functiondef(r.oid);
    n := replace(d, 'date_trunc(''month'', c.date)', 'coalesce(c.billing_month, date_trunc(''month'', c.date)::date)');
    n := replace(n, 'recalc_month_pending_cash(v_aff.student_id, v_class.date)', 'recalc_month_pending_cash(v_aff.student_id, public.class_billing_month(v_class.id))');
    n := replace(n, 'recalc_month_pending_cash(v_booking.student_id, v_class.date)', 'recalc_month_pending_cash(v_booking.student_id, public.class_billing_month(v_booking.class_id))');
    n := replace(n, 'recalc_month_pending_cash(v_student, v_class.date)', 'recalc_month_pending_cash(v_student, public.class_billing_month(v_booking.class_id))');
    IF n <> d THEN EXECUTE n; END IF;
  END LOOP;
END $do$;