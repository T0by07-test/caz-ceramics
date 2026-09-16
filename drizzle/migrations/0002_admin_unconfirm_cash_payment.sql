CREATE OR REPLACE FUNCTION public.admin_unconfirm_payment(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payment record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradoras pueden editar pagos';
  END IF;

  SELECT id, booking_id, status, stripe_session_id, method
    INTO v_payment
    FROM public.payments
    WHERE id = p_payment_id
    FOR UPDATE;
  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Pago no encontrado';
  END IF;

  -- Solo pagos en efectivo (marcados a mano) se pueden volver a dejar pendientes.
  IF NOT (v_payment.method = 'cash' OR v_payment.stripe_session_id LIKE 'cash:%') THEN
    RAISE EXCEPTION 'Solo se pueden deshacer los cobros en efectivo';
  END IF;

  IF v_payment.status <> 'confirmed' THEN
    RETURN;
  END IF;

  UPDATE public.payments SET status = 'pending' WHERE id = v_payment.id;

  IF v_payment.booking_id IS NOT NULL THEN
    UPDATE public.bookings SET status = 'reserved'
      WHERE id = v_payment.booking_id AND status = 'confirmed';
  END IF;

  IF v_payment.stripe_session_id LIKE 'cash:%' THEN
    UPDATE public.ledger_entries SET status = 'Pendiente'
      WHERE stripe_session_id = v_payment.stripe_session_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_unconfirm_payment(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_unconfirm_payment(uuid) TO authenticated;