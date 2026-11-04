CREATE OR REPLACE FUNCTION public.admin_set_ledger_amount(p_entry_id uuid, p_amount_cents integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_session text; v_status text; v_total int; v_last uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_amount_cents IS NULL OR p_amount_cents < 0 THEN RAISE EXCEPTION 'Importe no válido'; END IF;
  SELECT stripe_session_id, status INTO v_session, v_status FROM ledger_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrada no encontrada'; END IF;
  -- Linked pending cash payments: adjust so the student's pending amount matches (confirmed never touched)
  IF v_session IS NOT NULL AND v_session NOT LIKE 'cs_%' AND v_status = 'Pendiente' THEN
    SELECT coalesce(sum(amount_cents),0)::int INTO v_total FROM payments
     WHERE stripe_session_id = v_session AND status = 'pending';
    SELECT id INTO v_last FROM payments
     WHERE stripe_session_id = v_session AND status = 'pending'
     ORDER BY amount_cents DESC, created_at DESC LIMIT 1;
    IF v_last IS NOT NULL AND v_total <> p_amount_cents THEN
      IF v_total - (SELECT amount_cents FROM payments WHERE id = v_last) > p_amount_cents THEN
        -- reduce others to zero first, then set last
        UPDATE payments SET amount_cents = 0 WHERE stripe_session_id = v_session AND status='pending' AND id <> v_last;
        UPDATE payments SET amount_cents = p_amount_cents WHERE id = v_last;
      ELSE
        UPDATE payments SET amount_cents = amount_cents + (p_amount_cents - v_total) WHERE id = v_last;
      END IF;
    END IF;
  END IF;
  UPDATE ledger_entries SET amount_cents = p_amount_cents WHERE id = p_entry_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_ledger_amount(uuid,integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_ledger_amount(uuid,integer) TO authenticated;