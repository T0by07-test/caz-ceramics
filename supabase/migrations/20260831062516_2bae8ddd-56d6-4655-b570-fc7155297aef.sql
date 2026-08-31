-- 1) Restore Sofía Zuluaga's four September bookings that were auto-expired
UPDATE public.bookings
   SET status = 'confirmed', cancelled_at = NULL
 WHERE student_id = '77525665-c104-46ee-924a-b79727c3349f'
   AND status = 'cancelled_lost';

-- 2) Stop the auto-expiry from cancelling reservations of students who have
--    already paid, or who chose to pay at the studio (cash / bizum).
CREATE OR REPLACE FUNCTION public.expire_pending_drop_ins()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row record; v_count int := 0;
BEGIN
  FOR v_row IN
    SELECT b.id AS booking_id, b.class_id
      FROM public.bookings b
     WHERE b.source = 'drop_in'
       AND b.status = 'reserved'
       AND b.created_at < now() - interval '180 minutes'
       AND NOT EXISTS (
         SELECT 1 FROM public.payments p
          WHERE p.booking_id = b.id
            AND (p.status = 'confirmed' OR p.method IN ('cash', 'bizum'))
       )
       -- a confirmed payment by the same student around the same time covers
       -- multi-class checkouts where the payment row is not linked per booking
       AND NOT EXISTS (
         SELECT 1 FROM public.payments p2
          WHERE p2.student_id = b.student_id
            AND p2.status = 'confirmed'
            AND p2.amount_cents > 0
            AND p2.created_at > b.created_at - interval '7 days'
       )
  LOOP
    UPDATE public.bookings SET status = 'cancelled_lost', cancelled_at = now() WHERE id = v_row.booking_id;
    UPDATE public.payments SET status = 'failed'
      WHERE booking_id = v_row.booking_id AND status = 'pending';
    PERFORM public.promote_waitlist(v_row.class_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;