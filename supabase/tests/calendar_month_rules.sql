-- Regression test for calendar-month pricing, make-ups, admin moves and
-- pending-cash recalculation. Uses only synthetic rows created inside this
-- block and ALWAYS rolls back (it ends by raising the result report).
DO $test$
DECLARE
  u uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  m1 uuid; m2 uuid; m3 uuid; m31 uuid; a1 uuid; a2 uuid;
  b1 uuid; b2 uuid; b3 uuid; ba uuid; mk uuid; mkb uuid; mk_exp timestamptz;
  v int; v_txt text; rep text := ''; ok boolean := true;
  procedure_check text;
BEGIN
  INSERT INTO auth.users (id, email, aud, role) VALUES (u, 'test-'||u||'@example.invalid', 'authenticated', 'authenticated'),
    (adm, 'test-'||adm||'@example.invalid', 'authenticated', 'authenticated');
  INSERT INTO public.profiles (id, role, email) VALUES (u, 'user', 'x'), (adm, 'admin', 'y') ON CONFLICT (id) DO UPDATE SET role = excluded.role;

  INSERT INTO classes (date,start_time,end_time,capacity_ideal,capacity_max,status,audience,teacher) VALUES
   ('2027-03-03','10:30','12:30',6,8,'scheduled','adults','Cande') RETURNING id INTO m1;
  INSERT INTO classes (date,start_time,end_time,capacity_ideal,capacity_max,status,audience,teacher) VALUES
   ('2027-03-10','10:30','12:30',6,8,'scheduled','adults','Cande') RETURNING id INTO m2;
  INSERT INTO classes (date,start_time,end_time,capacity_ideal,capacity_max,status,audience,teacher) VALUES
   ('2027-03-17','10:30','12:30',6,8,'scheduled','adults','Cande') RETURNING id INTO m3;
  INSERT INTO classes (date,start_time,end_time,capacity_ideal,capacity_max,status,audience,teacher) VALUES
   ('2027-03-31','18:30','20:30',6,8,'scheduled','adults','Cande') RETURNING id INTO m31;
  INSERT INTO classes (date,start_time,end_time,capacity_ideal,capacity_max,status,audience,teacher) VALUES
   ('2027-04-07','10:30','12:30',6,8,'scheduled','adults','Cande') RETURNING id INTO a1;
  INSERT INTO classes (date,start_time,end_time,capacity_ideal,capacity_max,status,audience,teacher) VALUES
   ('2027-04-14','10:30','12:30',6,8,'scheduled','adults','Cande') RETURNING id INTO a2;

  -- 1. Two months from zero: 2 in March + 1 in April = 55 + 30 = 85
  INSERT INTO bookings (student_id,class_id,source,status) VALUES (u,m1,'drop_in','reserved') RETURNING id INTO b1;
  INSERT INTO bookings (student_id,class_id,source,status) VALUES (u,m2,'drop_in','reserved') RETURNING id INTO b2;
  INSERT INTO bookings (student_id,class_id,source,status) VALUES (u,a1,'drop_in','reserved') RETURNING id INTO ba;
  SELECT sum(amount_cents) INTO v FROM drop_in_amounts(u, ARRAY[b1,b2,ba]);
  rep := rep || format('two_months=%s(exp 8500) ', v); ok := ok AND v = 8500;
  SELECT sum(amount_cents) INTO v FROM drop_in_amounts(u, ARRAY[b1,b2]);
  ok := ok AND v = 5500;

  -- 2. Same-month increment: 1st class already paid 30 -> 2nd costs 25
  INSERT INTO payments (student_id,booking_id,amount_cents,status,method) VALUES (u,b1,3000,'confirmed','card');
  SELECT amount_cents INTO v FROM drop_in_amounts(u, ARRAY[b2]);
  rep := rep || format('second_same_month=%s(exp 2500) ', v); ok := ok AND v = 2500;

  -- 6. Cancellation with pending cash: 30 confirmed + 25 + 15 pending, cancel the 25 one -> remaining pending 25
  INSERT INTO bookings (student_id,class_id,source,status) VALUES (u,m3,'drop_in','confirmed') RETURNING id INTO b3;
  UPDATE bookings SET status='confirmed' WHERE id=b2;
  INSERT INTO payments (student_id,booking_id,amount_cents,status,method,stripe_session_id) VALUES
    (u,b2,2500,'pending','cash','cash_test_'||u), (u,b3,1500,'pending','cash','cash_test_'||u);
  INSERT INTO ledger_entries (entry_date, month, student_name, item, category, amount_cents, method, status, stripe_session_id)
    VALUES (current_date, '2027-03', 'Test', '2 clases', 'Clases', 4000, 'E', 'Pendiente', 'cash_test_'||u);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  PERFORM * FROM cancel_booking(b2);
  SELECT amount_cents INTO v FROM payments WHERE booking_id=b3 AND status='pending';
  rep := rep || format('recalc_pending=%s(exp 2500) ', v); ok := ok AND v = 2500;
  SELECT amount_cents INTO v FROM ledger_entries WHERE stripe_session_id='cash_test_'||u;
  rep := rep || format('ledger=%s(exp 2500) ', v); ok := ok AND v = 2500;
  SELECT amount_cents INTO v FROM payments WHERE booking_id=b1;
  ok := ok AND v = 3000; -- confirmed untouched

  -- 3. Make-up from cancelled March class: last day of March OK
  SELECT id, expires_at INTO mk, mk_exp FROM makeups WHERE source_booking_id=b2;
  rep := rep || format('makeup_exp=%s ', mk_exp AT TIME ZONE 'Europe/Madrid');
  -- 4. Next month target rejected
  BEGIN
    PERFORM * FROM book_makeup(a2);
    rep := rep || 'next_month=ALLOWED(bad) '; ok := false;
  EXCEPTION WHEN OTHERS THEN
    rep := rep || 'next_month=' || SQLERRM || ' '; ok := ok AND SQLERRM = 'MAKEUP_WRONG_MONTH';
  END;
  SELECT booking_id INTO mkb FROM book_makeup(m31);
  rep := rep || 'last_day=OK ';

  -- 6b. Admin move of the make-up to April is blocked; ordinary cross-month move blocked
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', adm::text, true);
  BEGIN
    PERFORM admin_move_booking(mkb, a2, 'test');
    rep := rep || 'admin_move_makeup=ALLOWED(bad) '; ok := false;
  EXCEPTION WHEN OTHERS THEN
    rep := rep || 'admin_move_makeup=' || SQLERRM || ' '; ok := ok AND SQLERRM = 'MAKEUP_MONTH_MISMATCH';
  END;
  BEGIN
    PERFORM admin_move_booking(b3, a2, 'test');
    rep := rep || 'admin_move_ordinary=ALLOWED(bad) '; ok := false;
  EXCEPTION WHEN OTHERS THEN
    rep := rep || 'admin_move_ordinary=' || SQLERRM || ' '; ok := ok AND SQLERRM = 'CROSS_MONTH_MOVE';
  END;
  PERFORM admin_move_booking(b3, m2, 'test'); -- same month still allowed
  rep := rep || 'admin_move_same_month=OK ';

  -- 5. Inherited chain: cancelling the make-up booking frees the SAME credit
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  PERFORM * FROM cancel_booking(mkb);
  SELECT count(*) INTO v FROM makeups WHERE student_id=u;
  rep := rep || format('makeups_after_chain=%s(exp 1) ', v); ok := ok AND v = 1;
  SELECT count(*) INTO v FROM makeups WHERE id=mk AND used_booking_id IS NULL AND expires_at = mk_exp;
  ok := ok AND v = 1;

  -- 7. Legacy credit: root class in March, expiry stored in APRIL (pre-fix data).
  --    Still "valid" by expires_at, but booking/moving into April must fail.
  DECLARE lb uuid; lm uuid; lmk uuid; lmb uuid; a3 uuid;
  BEGIN
    INSERT INTO classes (date,start_time,end_time,capacity_ideal,capacity_max,status,audience,teacher) VALUES
     ('2027-04-21','10:30','12:30',6,8,'scheduled','adults','Cande') RETURNING id INTO a3;
    INSERT INTO bookings (student_id,class_id,source,status) VALUES (u,m1,'drop_in','cancelled_recoverable') RETURNING id INTO lb;
    -- first hop of the chain: credit from March used on a March make-up, then that make-up was cancelled
    INSERT INTO bookings (student_id,class_id,source,status) VALUES (u,m3,'makeup','cancelled_recoverable') RETURNING id INTO lmb;
    INSERT INTO makeups (student_id,source_booking_id,used_booking_id,expires_at) VALUES (u,lb,lmb,'2027-04-30 21:59+00');
    -- legacy second credit minted from the make-up booking, expiring in April, no origin_month
    INSERT INTO makeups (student_id,source_booking_id,expires_at) VALUES (u,lmb,'2027-04-30 21:59+00') RETURNING id INTO lmk;
    SELECT makeup_origin_month(lmk) INTO v_txt;
    rep := rep || format('legacy_root=%s(exp 2027-03-01) ', v_txt); ok := ok AND v_txt = '2027-03-01';
    BEGIN
      PERFORM * FROM book_makeup(a3);
      rep := rep || 'legacy_april=ALLOWED(bad) '; ok := false;
    EXCEPTION WHEN OTHERS THEN
      rep := rep || 'legacy_april=' || SQLERRM || ' '; ok := ok AND SQLERRM = 'MAKEUP_WRONG_MONTH';
    END;
    -- deadline = first instant of April Madrid, not the stored April expiry
    rep := rep || format('legacy_deadline=%s ', makeup_deadline(lmk) AT TIME ZONE 'Europe/Madrid');
    ok := ok AND makeup_deadline(lmk) = '2027-04-01 00:00'::timestamp AT TIME ZONE 'Europe/Madrid';
    -- use it legitimately in March, then admin-move to April -> blocked; cancel -> same credit, still March-only
    UPDATE makeups SET used_booking_id = NULL WHERE student_id = u AND id <> lmk AND used_booking_id IS NOT NULL AND id <> mk;
    UPDATE makeups SET used_booking_id = NULL WHERE id = mk; -- keep only the legacy credit usable
    UPDATE makeups SET expires_at = now() - interval '1 day', origin_month = '2027-03-01' WHERE id = mk;
    SELECT booking_id INTO lmb FROM book_makeup(m2);
    SELECT count(*) INTO v FROM makeups WHERE id = lmk AND used_booking_id = lmb;
    rep := rep || format('legacy_used_in_march=%s(exp 1) ', v); ok := ok AND v = 1;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', adm::text, true);
    BEGIN
      PERFORM admin_move_booking(lmb, a3, 'test');
      rep := rep || 'legacy_admin_move=ALLOWED(bad) '; ok := false;
    EXCEPTION WHEN OTHERS THEN
      rep := rep || 'legacy_admin_move=' || SQLERRM || ' '; ok := ok AND SQLERRM = 'MAKEUP_MONTH_MISMATCH';
    END;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', u::text, true);
    PERFORM * FROM cancel_booking(lmb);
    SELECT count(*) INTO v FROM makeups WHERE student_id = u AND source_booking_id = lmb;
    rep := rep || format('chain_no_new_credit=%s(exp 0) ', v); ok := ok AND v = 0;
    BEGIN
      PERFORM * FROM book_makeup(a3);
      rep := rep || 'legacy_after_cancel_april=ALLOWED(bad) '; ok := false;
    EXCEPTION WHEN OTHERS THEN
      rep := rep || 'legacy_after_cancel_april=' || SQLERRM || ' '; ok := ok AND SQLERRM = 'MAKEUP_WRONG_MONTH';
    END;
  END;

  RAISE EXCEPTION 'TEST_RESULT ok=% | %', ok, rep;
END
$test$;
