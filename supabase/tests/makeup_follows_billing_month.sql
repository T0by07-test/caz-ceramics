-- Run with app.test_student set to a freshly minted, empty test account.
-- Ends with RAISE EXCEPTION 'TEST_PASS ...' so every fixture is rolled back.
DO $test$
DECLARE
  u uuid := current_setting('app.test_student', true)::uuid;
  sat_a uuid; sat_b uuid; decc uuid; nov uuid; jan uuid;
  b uuid; bn uuid; mk uuid; mn uuid; used uuid; report text := '';
BEGIN
  IF u IS NULL OR EXISTS (SELECT 1 FROM bookings WHERE student_id = u) THEN RAISE EXCEPTION 'Empty test student required'; END IF;
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,audience,teacher,billing_month)
    VALUES ('2026-11-28','07:00','08:00',99,'scheduled','adults','[TEST]','2026-12-01') RETURNING id INTO sat_a;
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,audience,teacher,billing_month)
    VALUES ('2026-11-28','21:00','22:00',99,'scheduled','adults','[TEST]','2026-12-01') RETURNING id INTO sat_b;
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,audience,teacher)
    VALUES ('2026-12-16','07:00','08:00',99,'scheduled','adults','[TEST]') RETURNING id INTO decc;
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,audience,teacher)
    VALUES ('2026-11-30','07:00','08:00',99,'scheduled','adults','[TEST]') RETURNING id INTO nov;
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,audience,teacher)
    VALUES ('2027-01-05','07:00','08:00',99,'scheduled','adults','[TEST]') RETURNING id INTO jan;

  -- 1. Cancelling the Saturday class (billed as December) yields a December credit.
  INSERT INTO bookings(student_id,class_id,source,status) VALUES (u,sat_a,'comp','confirmed') RETURNING id INTO b;
  SELECT makeup_id INTO mk FROM cancel_booking(b);
  IF mk IS NULL THEN RAISE EXCEPTION 'FAIL no credit created'; END IF;
  IF makeup_origin_month(mk) <> '2026-12-01' THEN RAISE EXCEPTION 'FAIL origin %', makeup_origin_month(mk); END IF;
  IF makeup_deadline(mk) <> ('2027-01-01'::timestamp AT TIME ZONE 'Europe/Madrid') THEN RAISE EXCEPTION 'FAIL deadline %', makeup_deadline(mk); END IF;
  report := report || 'credit=Dec until 1 Jan; ';

  -- 2. Not usable in a plain November class nor in January.
  BEGIN PERFORM * FROM book_makeup(nov); RAISE EXCEPTION 'FAIL november accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MAKEUP_WRONG_MONTH' THEN RAISE; END IF; END;
  BEGIN PERFORM * FROM book_makeup(jan); RAISE EXCEPTION 'FAIL january accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MAKEUP_WRONG_MONTH' THEN RAISE; END IF; END;
  report := report || 'nov/jan blocked; ';

  -- 3. Usable on 16 December; cancelling frees the same credit; usable on the other Saturday slot.
  SELECT booking_id INTO used FROM book_makeup(decc);
  PERFORM * FROM cancel_booking(used);
  IF (SELECT used_booking_id FROM makeups WHERE id = mk) IS NOT NULL OR (SELECT count(*) FROM makeups WHERE student_id = u) <> 1
    THEN RAISE EXCEPTION 'FAIL credit not freed or duplicated'; END IF;
  SELECT booking_id INTO used FROM book_makeup(sat_b);
  IF (SELECT used_booking_id FROM makeups WHERE id = mk) <> used THEN RAISE EXCEPTION 'FAIL saturday slot'; END IF;
  report := report || '16 Dec ok, freed, other Saturday slot ok; ';

  -- 4. A November credit stays in November but may be used on the Saturday.
  INSERT INTO bookings(student_id,class_id,source,status) VALUES (u,nov,'comp','confirmed') RETURNING id INTO bn;
  SELECT makeup_id INTO mn FROM cancel_booking(bn);
  IF makeup_origin_month(mn) <> '2026-11-01' THEN RAISE EXCEPTION 'FAIL nov origin'; END IF;
  BEGIN PERFORM * FROM book_makeup(decc); RAISE EXCEPTION 'FAIL nov credit accepted in december';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MAKEUP_WRONG_MONTH' THEN RAISE; END IF; END;
  SELECT booking_id INTO used FROM book_makeup(sat_a);
  IF (SELECT used_booking_id FROM makeups WHERE id = mn) <> used THEN RAISE EXCEPTION 'FAIL nov credit on saturday'; END IF;
  report := report || 'nov credit: Dec blocked, Saturday ok';

  RAISE EXCEPTION 'TEST_PASS %', report;
END $test$;
