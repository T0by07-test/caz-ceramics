-- Requires cazu.test_user_id pointing to a disposable agent auth user.
-- Deliberate TEST_PASS exception rolls back all fixtures and notifications.
DO $test$
DECLARE
  u uuid := nullif(current_setting('cazu.test_user_id',true),'')::uuid;
  c uuid[] := '{}'; b uuid[] := '{}'; cid uuid; bid uuid; i int; v int;
  cash_key text; card_key text; snap jsonb;
BEGIN
  IF u IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id=u AND email LIKE 'agent-test+%') THEN
    RAISE EXCEPTION 'Disposable agent user required';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  FOR i IN 1..4 LOOP
    INSERT INTO classes(date,start_time,end_time,capacity_ideal,capacity_max,status,audience,title,teacher)
    VALUES ('2027-06-01'::date+i*3,'10:30','12:30',6,7,'scheduled','adults','Test pending paths','Cande') RETURNING id INTO cid;
    c:=c||cid;
    SELECT booking_id INTO bid FROM book_class(cid,'drop_in',0,'{}'); b:=b||bid;
    INSERT INTO payments(student_id,booking_id,amount_cents,status,method,stripe_session_id)
    VALUES(u,bid,CASE i WHEN 1 THEN 3000 WHEN 2 THEN 2500 ELSE 1500 END,'pending','card','cs_test_old_'||u);
  END LOOP;
  PERFORM * FROM cancel_booking(b[1]); PERFORM * FROM cancel_booking(b[2]);
  SELECT sum(amount_cents) INTO v FROM current_pending_booking_amounts(u,b);
  IF v IS DISTINCT FROM 5500 THEN RAISE EXCEPTION 'Service current quote: expected 5500, got %',v; END IF;
  SELECT sum(amount_cents) INTO v FROM pending_booking_amounts(b);
  IF v IS DISTINCT FROM 5500 THEN RAISE EXCEPTION 'UI current quote: expected 5500, got %',v; END IF;

  -- A new warning must quote current debt, not the surviving 1500+1500 snapshots.
  -- Do not call the global warning job when ANY real booking would be eligible.
  IF EXISTS (SELECT 1 FROM bookings b0 WHERE b0.student_id<>u AND b0.source='drop_in' AND b0.status='reserved'
    AND b0.created_at < now()-interval '120 minutes' AND b0.created_at > now()-interval '180 minutes'
    AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id=b0.id AND (p.status='confirmed' OR p.method IN ('cash','bizum')))
    AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.student_id=b0.student_id AND p.status='confirmed' AND p.amount_cents>0 AND p.created_at>b0.created_at-interval '7 days')) THEN
    RAISE EXCEPTION 'Real warning candidates exist: do not run this test now';
  END IF;
  UPDATE bookings SET created_at=now()-interval '150 minutes' WHERE id=ANY(b);
  PERFORM warn_expiring_drop_in_holds();
  SELECT (payload->>'amount_cents')::int INTO v FROM notifications WHERE student_id=u AND type='payment_hold_warning' ORDER BY created_at DESC LIMIT 1;
  IF v IS DISTINCT FROM 5500 THEN RAISE EXCEPTION 'Warning: expected 5500, got %',v; END IF;

  PERFORM pay_drop_in_cash_batch(ARRAY[b[3],b[4]]);
  SELECT stripe_session_id INTO cash_key FROM payments WHERE booking_id=b[3] AND method='cash' AND status='pending';
  -- Manual cash overrides, including zero, must be preserved by both callers.
  UPDATE payments SET amount_cents=2700 WHERE booking_id=b[3] AND method='cash' AND status='pending';
  SELECT amount_cents INTO v FROM current_pending_booking_amounts(u,ARRAY[b[3]]);
  IF v IS DISTINCT FROM 2700 THEN RAISE EXCEPTION 'Edited cash lost: %',v; END IF;
  UPDATE payments SET amount_cents=0 WHERE booking_id=b[3] AND method='cash' AND status='pending';
  SELECT amount_cents INTO v FROM pending_booking_amounts(ARRAY[b[3]]);
  IF v IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Zero cash override lost: %',v; END IF;
  -- Restore the edited row before testing the standard two-class tier.
  UPDATE payments SET amount_cents=2700 WHERE booking_id=b[3] AND method='cash' AND status='pending';
  PERFORM recalc_month_pending_cash(u,'2027-06-01');
  SELECT sum(amount_cents) INTO v FROM payments WHERE stripe_session_id=cash_key AND status='pending';
  IF v IS DISTINCT FROM 5500 THEN RAISE EXCEPTION 'Cash reprice: %',v; END IF;

  -- Simulate backend settlement only: no Stripe/card charge is made.
  card_key:='cs_test_settlement_'||u;
  INSERT INTO payments(student_id,booking_id,amount_cents,status,method,stripe_session_id)
    SELECT u,a.booking_id,a.amount_cents,'pending','card',card_key FROM current_pending_booking_amounts(u,ARRAY[b[3],b[4]]) a;
  PERFORM confirm_drop_in_booking(card_key);
  SELECT sum(amount_cents) INTO v FROM ledger_entries WHERE stripe_session_id=cash_key AND status='Pendiente';
  IF v IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Alternative cash ledger still collectible: %',v; END IF;
  IF EXISTS (SELECT 1 FROM pending_booking_amounts(b)) THEN RAISE EXCEPTION 'Settled bookings remain unpaid'; END IF;
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) INTO snap FROM payments p WHERE p.stripe_session_id=card_key;
  PERFORM confirm_drop_in_booking(card_key);
  PERFORM * FROM cancel_booking(b[3]);
  IF snap IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM payments p WHERE p.stripe_session_id=card_key) THEN
    RAISE EXCEPTION 'Confirmed history changed';
  END IF;
  RAISE EXCEPTION 'TEST_PASS current=5500 warning=5500 cash_override=2700/0 cash_reprice=5500 alternative_cash_ledger=0 settled_history_unchanged; ROLLBACK';
END $test$;