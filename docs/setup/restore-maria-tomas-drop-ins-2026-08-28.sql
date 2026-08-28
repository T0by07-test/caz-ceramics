-- One-off data fix, run manually in the Supabase SQL editor.
--
-- Maria Bossotto and Tomás Eslava each booked several drop-in classes and
-- chose card checkout; the card payments never completed within the
-- (then 30-minute) hold window, so expire_pending_drop_ins() correctly
-- cancelled the bookings. They've now agreed to pay in cash at the studio,
-- so this restores exactly what pay_drop_in_cash_batch() would have done at
-- booking time: flips each booking back to 'confirmed' and records a
-- pending cash payment at the same batch-tiered price they'd have paid
-- together, then queues the normal booking-confirmed notification.
--
-- Verified before writing this: all 7 classes still have room (checked live,
-- 2026-08-28) — nobody else has taken these seats via the waitlist.
--
-- Run this AFTER applying supabase/migrations/20260828170000_fix_drop_in_late_payment_confirmation.sql
-- (not required for this script to work, but fixes the bug that caused this
-- in the first place, so it doesn't happen again).

DO $$
DECLARE
  v_maria uuid := '83e7fbf8-e98c-421a-965b-9b7ec65d13e6';
  v_tomas uuid := '1896e88c-7f82-4e13-9f01-e7522a2a9440';
  v_maria_bookings uuid[] := ARRAY[
    '54a378be-cb5b-47d4-8bc1-f967435980d0', -- 2026-09-24 18:30
    '08a6f890-ee95-4011-a39d-e7afcb19ba3a', -- 2026-09-17 18:30
    'b1d23fb7-678e-46a9-abe4-b5a0f65c48db'  -- 2026-09-10 18:30
  ];
  v_tomas_bookings uuid[] := ARRAY[
    '8865e3b6-ecce-47fc-82cd-385778f5188f', -- 2026-09-24 16:00
    'c6a640bc-536e-4a21-861c-6a5be7f9f826', -- 2026-09-17 16:00
    '11aa812f-a2a2-43cb-94d2-0cea2355f615', -- 2026-09-10 16:00
    '97f245bf-a06d-4706-b2f0-531c0ad03e9f'  -- 2026-09-03 16:00
  ];
  v_booking_id uuid;
  v_classes jsonb;
BEGIN
  -- Maria: 3 classes together -> tiered batch price (7000 / 3 = 2333 each).
  FOREACH v_booking_id IN ARRAY v_maria_bookings LOOP
    UPDATE public.bookings SET status = 'confirmed', cancelled_at = NULL
      WHERE id = v_booking_id AND status = 'cancelled_lost';
    INSERT INTO public.payments (student_id, booking_id, amount_cents, status, method)
      SELECT v_maria, v_booking_id, 2333, 'pending', 'cash'
      WHERE NOT EXISTS (SELECT 1 FROM public.payments WHERE booking_id = v_booking_id AND method = 'cash');
  END LOOP;

  -- Tomás: 4 classes together -> tiered batch price (8500 / 4 = 2125 each).
  FOREACH v_booking_id IN ARRAY v_tomas_bookings LOOP
    UPDATE public.bookings SET status = 'confirmed', cancelled_at = NULL
      WHERE id = v_booking_id AND status = 'cancelled_lost';
    INSERT INTO public.payments (student_id, booking_id, amount_cents, status, method)
      SELECT v_tomas, v_booking_id, 2125, 'pending', 'cash'
      WHERE NOT EXISTS (SELECT 1 FROM public.payments WHERE booking_id = v_booking_id AND method = 'cash');
  END LOOP;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'date', c.date, 'start_time', c.start_time, 'end_time', c.end_time,
    'teacher', c.teacher, 'audience', c.audience
  ) ORDER BY c.date, c.start_time), '[]'::jsonb)
  INTO v_classes
  FROM public.bookings b JOIN public.classes c ON c.id = b.class_id
  WHERE b.id = ANY(v_maria_bookings);
  IF jsonb_array_length(v_classes) > 0 THEN
    PERFORM public.enqueue_notification(
      v_maria, 'reservation_confirmed',
      jsonb_build_object('classes', v_classes, 'method', 'cash'),
      'restore-maria-2026-08-28'
    );
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'date', c.date, 'start_time', c.start_time, 'end_time', c.end_time,
    'teacher', c.teacher, 'audience', c.audience
  ) ORDER BY c.date, c.start_time), '[]'::jsonb)
  INTO v_classes
  FROM public.bookings b JOIN public.classes c ON c.id = b.class_id
  WHERE b.id = ANY(v_tomas_bookings);
  IF jsonb_array_length(v_classes) > 0 THEN
    PERFORM public.enqueue_notification(
      v_tomas, 'reservation_confirmed',
      jsonb_build_object('classes', v_classes, 'method', 'cash'),
      'restore-tomas-2026-08-28'
    );
  END IF;
END $$;

-- Sanity check after running:
-- select id, status, cancelled_at from public.bookings
--   where id = ANY(ARRAY[
--     '54a378be-cb5b-47d4-8bc1-f967435980d0','08a6f890-ee95-4011-a39d-e7afcb19ba3a',
--     'b1d23fb7-678e-46a9-abe4-b5a0f65c48db','8865e3b6-ecce-47fc-82cd-385778f5188f',
--     'c6a640bc-536e-4a21-861c-6a5be7f9f826','11aa812f-a2a2-43cb-94d2-0cea2355f615',
--     '97f245bf-a06d-4706-b2f0-531c0ad03e9f'
--   ]);
-- All 7 should show status = 'confirmed', cancelled_at = null.
