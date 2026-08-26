CREATE OR REPLACE FUNCTION public.admin_confirm_payment(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradoras pueden confirmar pagos';
  END IF;

  SELECT id, booking_id, status, student_id, stripe_session_id
    INTO v_payment
    FROM public.payments
    WHERE id = p_payment_id
    FOR UPDATE;
  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Pago no encontrado';
  END IF;
  IF v_payment.status = 'confirmed' THEN
    RETURN;
  END IF;

  IF v_payment.stripe_session_id IS NOT NULL THEN
    PERFORM public.confirm_drop_in_booking(v_payment.stripe_session_id);
    RETURN;
  END IF;

  UPDATE public.payments SET status = 'confirmed' WHERE id = v_payment.id;
  IF v_payment.booking_id IS NOT NULL THEN
    UPDATE public.bookings SET status = 'confirmed'
      WHERE id = v_payment.booking_id AND status = 'reserved';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_confirm_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_confirm_payment(uuid) TO authenticated;