-- One-off data fix, run manually in the Supabase SQL editor.
--
-- Same root cause as restore-maria-tomas-drop-ins-2026-08-28.sql: these 8
-- regular students each booked a batch of September drop-in classes on
-- 2026-08-27/28, the card/cash payment step never completed within the (then
-- 30-minute) hold window, and expire_pending_drop_ins() correctly-but-
-- unhelpfully cancelled every one of them. They're regulars who pay cash in
-- person, so this restores each affected booking to 'confirmed' and records
-- a pending cash payment at the same batch-tiered price they'd have paid
-- together — mirroring exactly what pay_drop_in_cash_batch() does.
--
-- Deliberately excluded: Camila Petrone (booking is 'cancelled_recoverable',
-- not 'cancelled_lost' — she went through the normal self-cancellation flow
-- with an already-confirmed card payment, a different and legitimate case
-- that needs its own look, not a blind restore).
--
-- For each student this only touches their 'cancelled_lost' + 'drop_in'
-- bookings, and only if the class still has room — if someone else has
-- taken the seat via the waitlist since, that booking is left alone and
-- listed in the final report for manual follow-up.

DO $$
DECLARE
  v_emails text[] := ARRAY[
    'agonu@hotmail.com',        -- Andrea Gómez
    'almolos@gmail.com',        -- Alvaro Moliner
    'ampapr87@gmail.com',       -- Amparo Prieto
    'cristinamilher@hotmail.com', -- Cris Milher
    'fernandoagonzalez150@gmail.com', -- Fernando A. González
    'mar_sone@hotmail.com',     -- Maria Soneira
    'paulaschmidt62@gmail.com', -- Paula Schmidt
    'sofiacordi@gmail.com'      -- Sofia Cordi
  ];
  v_email text;
  v_student uuid;
  v_booking record;
  v_adults int;
  v_kids int;
  v_adult_total int;
  v_adult_per_booking int;
  v_kids_per_booking int := 1200;
  v_capacity_max int;
  v_active_count int;
  v_price int;
BEGIN
  FOREACH v_email IN ARRAY v_emails LOOP
    SELECT id INTO v_student FROM public.profiles WHERE email = v_email;
    IF v_student IS NULL THEN
      RAISE NOTICE 'Skipping %: no profile found', v_email;
      CONTINUE;
    END IF;

    -- Tiered batch price, computed the same way pay_drop_in_cash_batch does,
    -- over ALL of this student's cancelled_lost drop-in bookings (their
    -- original batch), before checking room class-by-class.
    SELECT
      count(*) FILTER (WHERE c.audience <> 'kids'),
      count(*) FILTER (WHERE c.audience = 'kids')
    INTO v_adults, v_kids
    FROM public.bookings b
    JOIN public.classes c ON c.id = b.class_id
    WHERE b.student_id = v_student AND b.status = 'cancelled_lost' AND b.source = 'drop_in';

    v_adult_total := CASE
      WHEN v_adults = 0 THEN 0
      WHEN v_adults = 1 THEN 3000
      WHEN v_adults = 2 THEN 5500
      WHEN v_adults = 3 THEN 7000
      WHEN v_adults = 4 THEN 8500
      ELSE 8500 + (v_adults - 4) * 2000
    END;
    v_adult_per_booking := CASE WHEN v_adults > 0 THEN round(v_adult_total::numeric / v_adults) ELSE 0 END;

    FOR v_booking IN
      SELECT b.id, b.class_id, c.audience, c.date, c.start_time, c.capacity_max
        FROM public.bookings b
        JOIN public.classes c ON c.id = b.class_id
       WHERE b.student_id = v_student AND b.status = 'cancelled_lost' AND b.source = 'drop_in'
    LOOP
      SELECT count(*) INTO v_active_count
        FROM public.bookings
        WHERE class_id = v_booking.class_id AND status IN ('reserved', 'confirmed', 'attended');

      IF v_active_count >= v_booking.capacity_max THEN
        RAISE NOTICE 'SKIPPED (class full): % on % % (booking %)', v_email, v_booking.date, v_booking.start_time, v_booking.id;
        CONTINUE;
      END IF;

      v_price := CASE WHEN v_booking.audience = 'kids' THEN v_kids_per_booking ELSE v_adult_per_booking END;

      UPDATE public.bookings SET status = 'confirmed', cancelled_at = NULL WHERE id = v_booking.id;

      INSERT INTO public.payments (student_id, booking_id, amount_cents, status, method)
        SELECT v_student, v_booking.id, v_price, 'pending', 'cash'
        WHERE NOT EXISTS (SELECT 1 FROM public.payments WHERE booking_id = v_booking.id AND method = 'cash');

      PERFORM public.enqueue_notification(
        v_student, 'reservation_confirmed',
        jsonb_build_object('booking_id', v_booking.id, 'method', 'cash'),
        'restore-sept-2026-08-29-' || v_booking.id::text
      );

      RAISE NOTICE 'RESTORED: % on % % at % cents (booking %)', v_email, v_booking.date, v_booking.start_time, v_price, v_booking.id;
    END LOOP;
  END LOOP;
END $$;

-- Sanity check after running — anything still 'cancelled_lost' here means
-- the class filled up in the meantime and needs a manual look (refund /
-- recuperación / offer another date):
select p.name, p.surname, p.email, b.status, c.date, c.start_time
  from public.bookings b
  join public.profiles p on p.id = b.student_id
  join public.classes c on c.id = b.class_id
  where p.email in (
    'agonu@hotmail.com','almolos@gmail.com','ampapr87@gmail.com',
    'cristinamilher@hotmail.com','fernandoagonzalez150@gmail.com',
    'mar_sone@hotmail.com','paulaschmidt62@gmail.com','sofiacordi@gmail.com'
  )
  and b.source = 'drop_in'
  and c.date >= '2026-08-27'
  order by p.email, c.date;
-- Expect: all rows status = 'confirmed'. Any 'cancelled_lost' left needs
-- manual follow-up (class filled up before this ran).
