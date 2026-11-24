DO $mig$
DECLARE r record; d text; n text;
BEGIN
  FOR r IN SELECT p.oid, p.proname FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('cancel_booking','admin_cancel_class','auto_cancel_low_attendance','book_makeup','admin_move_booking') LOOP
    d := pg_get_functiondef(r.oid);
    IF r.proname = 'cancel_booking' THEN
      n := replace(d, $s$v_month := date_trunc('month', v_class.date)::date;$s$,
                      $s$v_month := public.class_billing_month(v_booking.class_id);$s$);
    ELSIF r.proname IN ('admin_cancel_class','auto_cancel_low_attendance') THEN
      n := replace(d, $s$v_month := date_trunc('month', v_class.date)::date;$s$,
                      $s$v_month := public.class_billing_month(v_class.id);$s$);
    ELSIF r.proname = 'book_makeup' THEN
      n := replace(d, $s$and public.makeup_origin_month(m.id) = date_trunc('month', v_class.date)::date$s$,
                      $s$and public.makeup_origin_month(m.id) in (date_trunc('month', v_class.date)::date, public.class_billing_month(p_class_id))$s$);
    ELSE
      n := replace(d, $s$public.makeup_origin_month(m.id) IS DISTINCT FROM date_trunc('month', v_target.date)::date$s$,
                      $s$NOT coalesce(public.makeup_origin_month(m.id) IN (date_trunc('month', v_target.date)::date, public.class_billing_month(p_target_class_id)), false)$s$);
      IF n = d THEN RAISE EXCEPTION 'pattern 1 not found in %', r.proname; END IF;
      d := n;
      n := replace(d, $s$IF date_trunc('month', v_from_date) <> date_trunc('month', v_target.date) THEN$s$,
                      $s$IF v_booking.source <> 'makeup' AND public.class_billing_month(v_booking.class_id) IS DISTINCT FROM public.class_billing_month(p_target_class_id) THEN$s$);
    END IF;
    IF n = d THEN RAISE EXCEPTION 'pattern not found in %', r.proname; END IF;
    EXECUTE n;
  END LOOP;
END $mig$;