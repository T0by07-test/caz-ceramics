CREATE OR REPLACE FUNCTION public.admin_set_payments_amount(p_payment_ids uuid[], p_amount_cents integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_total int; v_last uuid; v_last_amt int; v_bad int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_amount_cents IS NULL OR p_amount_cents < 0 THEN RAISE EXCEPTION 'Importe no válido'; END IF;
  SELECT count(*) INTO v_bad FROM payments WHERE id = ANY(p_payment_ids)
    AND NOT (coalesce(method,'') = 'cash' OR coalesce(stripe_session_id,'') LIKE 'cash:%');
  IF v_bad > 0 THEN RAISE EXCEPTION 'Solo se pueden editar importes de pagos en efectivo'; END IF;
  SELECT coalesce(sum(amount_cents),0)::int INTO v_total FROM payments WHERE id = ANY(p_payment_ids);
  SELECT id, amount_cents INTO v_last, v_last_amt FROM payments WHERE id = ANY(p_payment_ids)
   ORDER BY amount_cents DESC, created_at DESC LIMIT 1;
  IF v_last IS NULL OR v_total = p_amount_cents THEN RETURN; END IF;
  IF v_total - v_last_amt > p_amount_cents THEN
    UPDATE payments SET amount_cents = 0 WHERE id = ANY(p_payment_ids) AND id <> v_last;
    UPDATE payments SET amount_cents = p_amount_cents WHERE id = v_last;
  ELSE
    UPDATE payments SET amount_cents = amount_cents + (p_amount_cents - v_total) WHERE id = v_last;
  END IF;
  -- keep mirrored ledger lines in line with the payments
  UPDATE ledger_entries le SET amount_cents = s.total
    FROM (SELECT stripe_session_id sid, coalesce(sum(amount_cents),0)::int total FROM payments
           WHERE stripe_session_id IN (SELECT stripe_session_id FROM payments WHERE id = ANY(p_payment_ids))
             AND status IN ('pending','confirmed') GROUP BY stripe_session_id) s
   WHERE le.stripe_session_id = s.sid;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_payments_amount(uuid[],integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_payments_amount(uuid[],integer) TO authenticated;