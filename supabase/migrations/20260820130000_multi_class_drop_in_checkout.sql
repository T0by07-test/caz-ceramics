-- Allow a student to pay for several drop-in classes in a single Stripe checkout
-- session instead of being forced into a monthly plan to book more than one class.
--
-- payments.stripe_session_id was UNIQUE on its own (one payment row per session).
-- A multi-class purchase needs one payment row per booking, all sharing the same
-- session id, so the constraint becomes composite on (stripe_session_id, booking_id).
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_stripe_session_id_key;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_session_booking_key UNIQUE (stripe_session_id, booking_id);

-- confirm_drop_in_booking now confirms every booking tied to the session, not just one.
CREATE OR REPLACE FUNCTION public.confirm_drop_in_booking(p_session_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_payment record;
BEGIN
  FOR v_payment IN
    SELECT id, booking_id, status, student_id
      FROM public.payments
      WHERE stripe_session_id = p_session_id
      FOR UPDATE
  LOOP
    IF v_payment.status = 'confirmed' THEN
      CONTINUE;
    END IF;
    UPDATE public.payments SET status = 'confirmed' WHERE id = v_payment.id;
    IF v_payment.booking_id IS NULL THEN
      CONTINUE;
    END IF;
    UPDATE public.bookings SET status = 'confirmed'
      WHERE id = v_payment.booking_id AND status = 'reserved';
    IF FOUND THEN
      PERFORM public.enqueue_notification(
        v_payment.student_id,
        'reservation_confirmed',
        jsonb_build_object('booking_id', v_payment.booking_id),
        v_payment.booking_id::text
      );
    END IF;
  END LOOP;
END;
$function$;

-- Cash payment for a batch of drop-in classes: confirms every seat atomically,
-- payments stay pending (paid in person at the studio).
CREATE OR REPLACE FUNCTION public.pay_drop_in_cash_batch(p_booking_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student uuid := auth.uid();
  v_booking_id uuid;
  v_booking record;
BEGIN
  IF v_student IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode = '28000'; END IF;
  IF p_booking_ids IS NULL OR array_length(p_booking_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_BOOKINGS' USING errcode = '22023';
  END IF;

  FOREACH v_booking_id IN ARRAY p_booking_ids LOOP
    SELECT id, student_id, source, status INTO v_booking
      FROM public.bookings WHERE id = v_booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING errcode = 'P0002'; END IF;
    IF v_booking.student_id <> v_student THEN RAISE EXCEPTION 'NOT_OWNER' USING errcode = '42501'; END IF;
    IF v_booking.source <> 'drop_in' THEN RAISE EXCEPTION 'INVALID_SOURCE' USING errcode = '22023'; END IF;

    IF EXISTS (SELECT 1 FROM public.payments WHERE booking_id = v_booking_id AND method = 'cash') THEN
      CONTINUE;
    END IF;
    IF v_booking.status NOT IN ('reserved','confirmed') THEN
      RAISE EXCEPTION 'BOOKING_NOT_ACTIVE' USING errcode = '22023';
    END IF;

    INSERT INTO public.payments (student_id, booking_id, amount_cents, status, method)
      VALUES (v_student, v_booking_id, 2000, 'pending', 'cash');

    UPDATE public.bookings SET status = 'confirmed' WHERE id = v_booking_id AND status = 'reserved';

    PERFORM public.enqueue_notification(
      v_student, 'reservation_confirmed',
      jsonb_build_object('booking_id', v_booking_id, 'method', 'cash'),
      v_booking_id::text
    );
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.pay_drop_in_cash_batch(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_drop_in_cash_batch(uuid[]) TO authenticated, service_role;
