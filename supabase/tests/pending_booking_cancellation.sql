-- Run with cazu.test_user_id set to a disposable auth user's UUID.
-- Only synthetic classes/bookings are used. The final exception ALWAYS rolls
-- back all fixtures, notifications and payment/ledger changes.
DO $test$
DECLARE
  u uuid := nullif(current_setting('cazu.test_user_id', true), '')::uuid;
  c uuid[] := '{}'; b uuid[] := '{}'; next_c uuid; next_b uuid;
  cid uuid; bid uuid; mkb1 uuid; mkb2 uuid; v int; i int;
  card_c uuid[] := '{}'; card_b uuid[] := '{}'; snapshots jsonb;
BEGIN
  IF u IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = u AND email LIKE 'agent-test+%') THEN
    RAISE EXCEPTION 'A disposable agent test user is required';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);

  FOR i IN 1..6 LOOP
    INSERT INTO classes(date,start_time,end_time,capacity_ideal,capacity_max,status,audience,title,teacher)
    VALUES ('2027-03-01'::date + i * 3,'10:30','12:30',6,7,'scheduled','adults','Test cash cancellation','Cande')
    RETURNING id INTO cid;
    c := c || cid;
    IF i <= 4 THEN
      SELECT booking_id INTO bid FROM book_class(cid,'drop_in',0,'{}');
      b := b || bid;
    END IF;
  END LOOP;
  INSERT INTO classes(date,start_time,end_time,capacity_ideal,capacity_max,status,audience,title,teacher)
  VALUES ('2027-04-04','10:30','12:30',6,7,'scheduled','adults','Test other month','Cande') RETURNING id INTO next_c;
  SELECT booking_id INTO next_b FROM book_class(next_c,'drop_in',0,'{}');
  PERFORM pay_drop_in_cash_batch(b || next_b);
  SELECT sum(amount_cents) INTO v FROM pending_booking_amounts(b);
  IF v IS DISTINCT FROM 8500 THEN RAISE EXCEPTION 'four cash classes: expected 8500, got %',v; END IF;

  PERFORM * FROM cancel_booking(b[1]);
  SELECT sum(amount_cents) INTO v FROM pending_booking_amounts(b);
  IF v IS DISTINCT FROM 7000 THEN RAISE EXCEPTION 'three cash classes: expected 7000, got %',v; END IF;
  PERFORM * FROM cancel_booking(b[2]);
  SELECT sum(amount_cents) INTO v FROM pending_booking_amounts(b);
  IF v IS DISTINCT FROM 5500 THEN RAISE EXCEPTION 'two cash classes: expected 5500, got %',v; END IF;
  SELECT sum(p.amount_cents) INTO v FROM payments p WHERE p.booking_id=ANY(b) AND p.status='pending' AND p.method='cash';
  IF v IS DISTINCT FROM 5500 THEN RAISE EXCEPTION 'cash rows: expected 5500, got %',v; END IF;
  SELECT sum(amount_cents) INTO v FROM ledger_entries WHERE stripe_session_id IN
    (SELECT stripe_session_id FROM payments WHERE booking_id=ANY(b) AND method='cash');
  IF v IS DISTINCT FROM 5500 THEN RAISE EXCEPTION 'ledger: expected 5500, got %',v; END IF;
  SELECT sum(amount_cents) INTO v FROM pending_booking_amounts(ARRAY[next_b]);
  IF v IS DISTINCT FROM 3000 THEN RAISE EXCEPTION 'other month changed: %',v; END IF;

  SELECT booking_id INTO mkb1 FROM book_makeup(c[5]);
  SELECT sum(amount_cents) INTO v FROM pending_booking_amounts(b);
  IF v IS DISTINCT FROM 7000 THEN RAISE EXCEPTION 'one recovery: expected 7000, got %',v; END IF;
  SELECT booking_id INTO mkb2 FROM book_makeup(c[6]);
  SELECT sum(amount_cents) INTO v FROM pending_booking_amounts(b);
  IF v IS DISTINCT FROM 8500 THEN RAISE EXCEPTION 'two recoveries: expected 8500, got %',v; END IF;
  PERFORM * FROM cancel_booking(mkb1);
  PERFORM * FROM cancel_booking(mkb2);
  SELECT sum(amount_cents) INTO v FROM pending_booking_amounts(b);
  IF v IS DISTINCT FROM 5500 THEN RAISE EXCEPTION 'released recoveries: expected 5500, got %',v; END IF;

  -- Old card attempts must retain Stripe's historical amounts, but neither the
  -- UI nor a newly created checkout may treat those amounts as current debt.
  FOR i IN 1..4 LOOP
    INSERT INTO classes(date,start_time,end_time,capacity_ideal,capacity_max,status,audience,title,teacher)
    VALUES ('2027-05-01'::date + i * 3,'10:30','12:30',6,7,'scheduled','adults','Test card snapshot','Cande') RETURNING id INTO cid;
    card_c := card_c || cid;
    SELECT booking_id INTO bid FROM book_class(cid,'drop_in',0,'{}');
    card_b := card_b || bid;
    INSERT INTO payments(student_id,booking_id,amount_cents,status,method,stripe_session_id)
    VALUES (u,bid,CASE i WHEN 1 THEN 3000 WHEN 2 THEN 2500 ELSE 1500 END,'pending','card','cs_test_snapshot_' || u);
  END LOOP;
  PERFORM * FROM cancel_booking(card_b[1]);
  PERFORM * FROM cancel_booking(card_b[2]);
  SELECT sum(amount_cents) INTO v FROM payments WHERE booking_id=ANY(card_b) AND status='pending';
  IF v IS DISTINCT FROM 3000 THEN RAISE EXCEPTION 'historical Stripe snapshots were rewritten: %',v; END IF;
  SELECT sum(amount_cents) INTO v FROM pending_booking_amounts(card_b);
  IF v IS DISTINCT FROM 5500 THEN RAISE EXCEPTION 'current card quote: expected 5500, got %',v; END IF;
  SELECT sum(amount_cents) INTO v FROM drop_in_amounts(u,ARRAY[card_b[3],card_b[4]]);
  IF v IS DISTINCT FROM 5500 THEN RAISE EXCEPTION 'checkout quote: expected 5500, got %',v; END IF;

  -- Quoting one card row still includes its other unpaid class in the tier.
  SELECT amount_cents INTO v FROM pending_booking_amounts(ARRAY[card_b[4]]);
  IF v IS DISTINCT FROM 2500 THEN RAISE EXCEPTION 'partial roster quote: expected 2500, got %',v; END IF;

  -- Already collected amounts remain byte-for-byte intact through cancellation.
  UPDATE payments SET status='confirmed' WHERE booking_id=ANY(b) AND method='cash' AND amount_cents>0;
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) INTO snapshots FROM payments p WHERE booking_id=ANY(b) AND status='confirmed';
  PERFORM * FROM cancel_booking(b[3]);
  IF snapshots IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM payments p WHERE booking_id=ANY(b) AND status='confirmed') THEN
    RAISE EXCEPTION 'confirmed payments changed';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  BEGIN
    PERFORM * FROM pending_booking_amounts(card_b);
    RAISE EXCEPTION 'Unauthorized quote allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'NOT_OWNER' THEN RAISE; END IF;
  END;
  RAISE EXCEPTION 'TEST_PASS cash=8500->7000->5500 ledger=5500 recovery=7000->8500->5500 card_snapshot=3000 current_quote=5500 checkout=5500 other_month=3000 confirmed_unchanged privacy=OK; ROLLBACK';
END $test$;