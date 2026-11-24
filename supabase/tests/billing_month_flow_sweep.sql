-- Run with app.test_student set to a freshly minted, empty test account.
-- Every fixture, synthetic payment, role change and notification is rolled back.
DO $test$
DECLARE
  u uuid := current_setting('app.test_student', true)::uuid;
  sat uuid; dec1 uuid; dec2 uuid; dec3 uuid; dec_target uuid; nov1 uuid; nov2 uuid; recovery uuid; kids uuid;
  b uuid; b1 uuid; b2 uuid; b3 uuid; bk uuid; mk uuid; mb uuid; paid uuid; sid text;
  v int; key text; report text := '';
BEGIN
  IF u IS NULL OR EXISTS (SELECT 1 FROM bookings WHERE student_id = u)
    OR EXISTS (SELECT 1 FROM payments WHERE student_id = u) THEN RAISE EXCEPTION 'Empty test student required'; END IF;
  UPDATE profiles SET is_regular = true WHERE id = u;
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,audience,teacher,billing_month)
    VALUES ('2026-11-28','17:00','19:00',99,'scheduled','adults','[TEST] Billing','2026-12-01') RETURNING id INTO sat;
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,audience,teacher)
    VALUES ('2026-12-02','15:00','17:00',99,'scheduled','adults','[TEST] Billing') RETURNING id INTO dec1;
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,audience,teacher)
    VALUES ('2026-12-09','15:00','17:00',99,'scheduled','adults','[TEST] Billing') RETURNING id INTO dec2;
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,audience,teacher)
    VALUES ('2026-12-16','10:30','12:30',99,'scheduled','adults','[TEST] Billing') RETURNING id INTO dec3;
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,audience,teacher)
    VALUES ('2026-12-18','10:00','12:00',99,'scheduled','adults','[TEST] Billing') RETURNING id INTO dec_target;
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,audience,teacher)
    VALUES ('2026-11-26','10:00','12:00',99,'scheduled','adults','[TEST] Billing') RETURNING id INTO nov1;
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,audience,teacher)
    VALUES ('2026-11-30','10:00','12:00',99,'scheduled','adults','[TEST] Billing') RETURNING id INTO nov2;
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,audience,teacher)
    VALUES ('2026-11-29','10:00','12:00',99,'scheduled','adults','[TEST] Billing') RETURNING id INTO recovery;
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,audience,teacher)
    VALUES ('2026-12-07','17:00','18:00',99,'scheduled','kids','[TEST] Billing') RETURNING id INTO kids;

  v := quote_my_selection(ARRAY[sat,dec1,dec2,dec3],0);
  IF v IS DISTINCT FROM 8500 THEN RAISE EXCEPTION 'Four December classes: expected 8500, got %',v; END IF;
  v := quote_my_selection(ARRAY[nov1,sat,nov2,dec1,dec2,dec3],0);
  IF v IS DISTINCT FROM 14000 THEN RAISE EXCEPTION 'Interleaved billing months: expected 5500+8500, got %',v; END IF;
  report := report || 'quote_four=8500; interleaved=14000; ';

  BEGIN
    SELECT booking_id INTO b FROM book_class(sat,'drop_in',0,'{}');
    SELECT booking_id INTO b1 FROM book_class(dec1,'drop_in',0,'{}');
    SELECT booking_id INTO b2 FROM book_class(dec2,'drop_in',0,'{}');
    SELECT booking_id INTO b3 FROM book_class(dec3,'drop_in',0,'{}');
    PERFORM pay_drop_in_cash_batch(ARRAY[b,b1,b2,b3]);
    SELECT sum(amount_cents)::int INTO v FROM payments WHERE student_id = u AND method='cash' AND status='pending';
    IF v IS DISTINCT FROM 8500 THEN RAISE EXCEPTION 'Cash expected 8500, got %',v; END IF;
    SELECT count(*) INTO v FROM ledger_entries WHERE stripe_session_id IN (SELECT stripe_session_id FROM payments WHERE student_id=u AND method='cash') AND month='2026-12' AND amount_cents=8500 AND entry_date=(now() AT TIME ZONE 'Europe/Madrid')::date;
    IF v <> 1 THEN RAISE EXCEPTION 'Cash ledger month/date incorrect'; END IF;
    PERFORM pay_drop_in_cash_batch(ARRAY[b,b1,b2,b3]);
    SELECT count(*) INTO v FROM payments WHERE student_id=u AND method='cash';
    IF v <> 4 THEN RAISE EXCEPTION 'Cash repeat duplicated payments'; END IF;
    PERFORM cancel_booking(b);
    SELECT sum(amount_cents)::int INTO v FROM payments WHERE student_id=u AND method='cash' AND status='pending';
    IF v IS DISTINCT FROM 7000 THEN RAISE EXCEPTION 'Cancel expected remaining 7000, got %',v; END IF;
    SELECT id INTO mk FROM makeups WHERE source_booking_id=b;
    IF makeup_origin_month(mk) IS DISTINCT FROM '2026-11-01'::date OR makeup_billing_month(mk) IS DISTINCT FROM '2026-12-01'::date THEN RAISE EXCEPTION 'Recovery/billing months confused'; END IF;
    SELECT booking_id INTO mb FROM book_makeup(recovery);
    SELECT sum(amount_cents)::int INTO v FROM payments WHERE student_id=u AND method='cash' AND status='pending';
    IF v IS DISTINCT FROM 8500 THEN RAISE EXCEPTION 'Recovered class should restore December 8500, got %',v; END IF;
    SELECT sum(amount_cents)::int INTO v FROM ledger_entries WHERE stripe_session_id IN (SELECT stripe_session_id FROM payments WHERE student_id=u AND method='cash') AND status='Pendiente';
    IF v IS DISTINCT FROM 8500 THEN RAISE EXCEPTION 'Recovery ledger expected 8500, got %',v; END IF;
    PERFORM cancel_booking(mb);
    IF makeup_origin_month(mk) IS DISTINCT FROM '2026-11-01'::date THEN RAISE EXCEPTION 'Recovery root changed on cancellation'; END IF;
    BEGIN
      PERFORM book_makeup(dec_target);
      RAISE EXCEPTION 'December recovery accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN
      IF SQLERRM <> 'MAKEUP_WRONG_MONTH' THEN RAISE; END IF;
    END;
    SELECT booking_id INTO mb FROM book_makeup(recovery);
    UPDATE profiles SET role='admin' WHERE id=u;
    BEGIN
      PERFORM admin_move_booking(b1,sat,'Synthetic billing month check');
      RAISE EXCEPTION 'Cross-calendar normal move accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM <> 'CROSS_MONTH_MOVE' THEN RAISE; END IF; END;
    -- Ordinary November -> Saturday: same calendar month but different billing month.
    SELECT booking_id INTO bk FROM book_class(nov1,'drop_in',0,'{}');
    BEGIN
      PERFORM admin_move_booking(bk,sat,'Synthetic billing month check');
      RAISE EXCEPTION 'Cross-billing move accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM <> 'CROSS_MONTH_MOVE' THEN RAISE; END IF; END;
    FOR paid IN SELECT id FROM payments WHERE student_id=u AND method='cash' AND status='pending' LOOP PERFORM admin_confirm_payment(paid); END LOOP;
    SELECT count(*) INTO v FROM ledger_entries WHERE stripe_session_id IN (SELECT stripe_session_id FROM payments WHERE student_id=u AND method='cash') AND status='Pagado' AND amount_cents=8500;
    IF v <> 1 THEN RAISE EXCEPTION 'Failed cancelled rows blocked cash collection'; END IF;
    report := report || 'cash=8500; repeat_no_duplicates; cancel=7000; November_recovery_reprices_December=8500; ledger=8500; moves_blocked; ';
    RAISE EXCEPTION 'CASE_DONE';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'CASE_DONE' THEN RAISE; END IF; END;

  BEGIN
    SELECT booking_id INTO b FROM book_class(sat,'drop_in',0,'{}');
    INSERT INTO payments(student_id,booking_id,amount_cents,status,method) VALUES(u,b,3000,'confirmed','card');
    IF quote_my_selection(ARRAY[dec1],0) <> 2500 THEN RAISE EXCEPTION 'Second December class increment must be 2500'; END IF;
    SELECT booking_id INTO b1 FROM book_class(dec1,'drop_in',0,'{}');
    PERFORM pay_drop_in_cash(b1);
    SELECT sum(amount_cents)::int INTO v FROM payments WHERE student_id=u AND method='cash' AND status='pending';
    IF v IS DISTINCT FROM 2500 THEN RAISE EXCEPTION 'Single cash RPC must share incremental pricing'; END IF;
    SELECT amount_cents INTO v FROM payments WHERE booking_id=b AND status='confirmed';
    IF v <> 3000 THEN RAISE EXCEPTION 'Confirmed payment changed'; END IF;
    report := report || 'incremental_single_cash=2500; confirmed_unchanged; ';
    RAISE EXCEPTION 'CASE_DONE';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'CASE_DONE' THEN RAISE; END IF; END;

  BEGIN
    SELECT booking_id INTO b FROM book_class(sat,'drop_in',0,'{}');
    SELECT booking_id INTO b1 FROM book_class(dec1,'drop_in',0,'{}');
    PERFORM pay_drop_in_cash_batch(ARRAY[b,b1]);
    UPDATE profiles SET role='admin' WHERE id=u;
    UPDATE classes SET status='cancelled_by_admin' WHERE id=sat;
    IF (SELECT status FROM bookings WHERE id=b) <> 'confirmed' THEN RAISE EXCEPTION 'Blocking changed booking'; END IF;
    IF admin_cancel_class(sat) <> 1 OR admin_cancel_class(sat) <> 0 THEN RAISE EXCEPTION 'Studio cancellation repeat failed'; END IF;
    SELECT sum(amount_cents)::int INTO v FROM payments WHERE student_id=u AND method='cash' AND status='pending';
    IF v IS DISTINCT FROM 3000 THEN RAISE EXCEPTION 'Studio cancellation must reprice December remainder to 3000'; END IF;
    SELECT id INTO mk FROM makeups WHERE source_booking_id=b;
    IF makeup_origin_month(mk) IS DISTINCT FROM '2026-11-01'::date THEN RAISE EXCEPTION 'Studio cancellation changed recovery month'; END IF;
    report := report || 'block_keeps_booking; studio_cancel_reprices_December=3000; repeat_idempotent; ';
    RAISE EXCEPTION 'CASE_DONE';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'CASE_DONE' THEN RAISE; END IF; END;

  BEGIN
    SELECT booking_id INTO b FROM book_class(sat,'drop_in',0,'{}');
    SELECT booking_id INTO b1 FROM book_class(dec1,'drop_in',0,'{}');
    SELECT booking_id INTO b2 FROM book_class(dec2,'drop_in',0,'{}');
    SELECT booking_id INTO b3 FROM book_class(dec3,'drop_in',0,'{}');
    sid := 'cs_test_synthetic_' || u;
    INSERT INTO payments(student_id,booking_id,amount_cents,status,method,stripe_session_id)
      SELECT u,a.booking_id,a.amount_cents,'pending','card',sid FROM drop_in_amounts(u,ARRAY[b,b1,b2,b3]) a;
    PERFORM confirm_drop_in_booking(sid);
    PERFORM record_drop_in_ledger(sid,'2026-11-24','card');
    PERFORM record_drop_in_ledger(sid,'2026-11-25','card');
    SELECT count(*) INTO v FROM ledger_entries WHERE stripe_session_id=sid||':2026-12' AND amount_cents=8500 AND entry_date='2026-11-24' AND month='2026-12';
    IF v <> 1 THEN RAISE EXCEPTION 'Card ledger month, amount, real date or retry failed'; END IF;
    -- Legacy settled receipt is never changed, reclassified or duplicated.
    INSERT INTO ledger_entries(stripe_session_id,amount_cents,entry_date,month,status) VALUES(sid||'_legacy',8500,'2026-11-24','2026-11','Pagado');
    UPDATE payments SET stripe_session_id=sid||'_legacy' WHERE student_id=u AND stripe_session_id=sid;
    PERFORM record_drop_in_ledger(sid||'_legacy','2026-11-25','card');
    SELECT count(*) INTO v FROM ledger_entries WHERE left(stripe_session_id,length(sid||'_legacy'))=sid||'_legacy';
    IF v <> 1 THEN RAISE EXCEPTION 'Legacy paid receipt duplicated'; END IF;
    report := report || 'synthetic_card=8500_December; real_date_retained; retry_idempotent; historical_receipt_untouched; ';
    RAISE EXCEPTION 'CASE_DONE';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'CASE_DONE' THEN RAISE; END IF; END;

  IF quote_my_selection(ARRAY[kids],0) <> 1200 THEN RAISE EXCEPTION 'Kids tariff changed'; END IF;
  RAISE EXCEPTION 'TEST_PASS (all fixtures rolled back): %kids=1200', report;
END $test$;