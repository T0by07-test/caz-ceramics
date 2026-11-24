-- Set app.test_student to an empty disposable account before running.
-- Expected TEST_PASS exception rolls back every fixture and test-account change.
DO $test$
DECLARE u uuid := current_setting('app.test_student',true)::uuid;
  sat uuid; dec uuid; paid_class uuid; comp_class uuid; b uuid; b1 uuid; bp uuid; bc uuid; v int;
BEGIN
  IF u IS NULL OR EXISTS(SELECT 1 FROM bookings WHERE student_id=u) THEN RAISE EXCEPTION 'Empty test account required'; END IF;
  UPDATE profiles SET role='admin' WHERE id=u;
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  INSERT INTO classes(date,start_time,end_time,billing_month,capacity_max,status,teacher)
    VALUES('2026-11-28','10:00','12:00','2026-12-01',99,'scheduled','[TEST] Restore') RETURNING id INTO sat;
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,teacher)
    VALUES('2026-12-02','15:00','17:00',99,'scheduled','[TEST] Restore') RETURNING id INTO dec;
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,teacher)
    VALUES('2026-12-09','15:00','17:00',99,'scheduled','[TEST] Restore') RETURNING id INTO paid_class;
  INSERT INTO classes(date,start_time,end_time,capacity_max,status,teacher)
    VALUES('2026-12-16','15:00','17:00',99,'scheduled','[TEST] Restore') RETURNING id INTO comp_class;
  INSERT INTO bookings(student_id,class_id,status,source) VALUES(u,sat,'cancelled_lost','drop_in') RETURNING id INTO b;
  INSERT INTO payments(student_id,booking_id,status,method,amount_cents) VALUES(u,b,'failed','card',3000);
  INSERT INTO bookings(student_id,class_id,status,source) VALUES(u,dec,'confirmed','drop_in') RETURNING id INTO b1;
  INSERT INTO payments(student_id,booking_id,status,method,amount_cents) VALUES(u,b1,'confirmed','card',3000);
  PERFORM admin_restore_released_booking(b);
  SELECT sum(amount_cents)::int INTO v FROM payments WHERE student_id=u AND status='pending';
  IF v IS DISTINCT FROM 2500 THEN RAISE EXCEPTION 'Restoring second December class must cost 2500, got %',v; END IF;
  SELECT count(*) INTO v FROM ledger_entries WHERE stripe_session_id IN(SELECT stripe_session_id FROM payments WHERE booking_id=b AND status='pending') AND month='2026-12' AND amount_cents=2500;
  IF v<>1 THEN RAISE EXCEPTION 'Restored ledger not December 2500'; END IF;
  SELECT amount_cents INTO v FROM payments WHERE booking_id=b1 AND status='confirmed';
  IF v<>3000 THEN RAISE EXCEPTION 'Confirmed payment changed'; END IF;
  INSERT INTO bookings(student_id,class_id,status,source) VALUES(u,paid_class,'cancelled_lost','drop_in') RETURNING id INTO bp;
  INSERT INTO payments(student_id,booking_id,status,method,amount_cents) VALUES(u,bp,'confirmed','card',1500);
  PERFORM admin_restore_released_booking(bp);
  IF EXISTS(SELECT 1 FROM payments WHERE booking_id=bp AND status='pending') THEN RAISE EXCEPTION 'Paid restored booking charged again'; END IF;
  INSERT INTO bookings(student_id,class_id,status,source) VALUES(u,comp_class,'cancelled_lost','comp') RETURNING id INTO bc;
  PERFORM admin_restore_released_booking(bc);
  IF EXISTS(SELECT 1 FROM payments WHERE booking_id=bc AND amount_cents>0) THEN RAISE EXCEPTION 'Courtesy restoration charged'; END IF;
  RAISE EXCEPTION 'TEST_PASS (rolled back): restored_increment=2500_December; ledger=2500_December; paid_3000_unchanged; already_paid_not_recharged; courtesy_not_charged';
END $test$;