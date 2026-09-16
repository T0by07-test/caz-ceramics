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

  IF NOT (v_payment.method = 'cash' OR v_payment.stripe_session_id LIKE 'cash:%') THEN
    RAISE EXCEPTION 'Solo se pueden deshacer los cobros en efectivo';
  END IF;

  IF v_payment.status <> 'confirmed' THEN
    RETURN;
  END IF;

  -- El pago vuelve a pendiente, pero la reserva se mantiene confirmada para que
  -- expire_pending_drop_ins() no libere la plaza de la alumna.
  UPDATE public.payments SET status = 'pending' WHERE id = v_payment.id;

  IF v_payment.stripe_session_id LIKE 'cash:%' THEN
    UPDATE public.ledger_entries SET status = 'Pendiente'
      WHERE stripe_session_id = v_payment.stripe_session_id;
  END IF;
END;
$function$;