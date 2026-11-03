-- Regression test for admin_cancel_class vs. "Bloquear horario".
-- Synthetic rows only; ALWAYS rolls back (ends by raising the report).
DO $test$
DECLARE
  u uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  src_cls uuid; c uuid; blk uuid; b_src uuid; b_norm uuid; b_mk uuid; b_blk uuid; mk uuid;
  v int; rep text := ''; ok boolean := true; v_txt text;
BEGIN
  INSERT INTO auth.users (id, email, aud, role) VALUES
    (u, 'test-'||u||'@example.invalid','authenticated','authenticated'),
    (u2,'test-'||u2||'@example.invalid','authenticated','authenticated'),
    (adm,'test-'||adm||'@example.invalid','authenticated','authenticated');
  INSERT INTO profiles (id, role, email) VALUES (u,'user','a'),(u2,'user','b'),(adm,'admin','c')
    ON CONFLICT (id) DO UPDATE SET role = excluded.role;

  INSERT INTO classes (date,start_time,end_time,capacity_ideal,capacity_max,status,audience,teacher)
    VALUES ('2027-03-02','10:30','12:30',6,8,'auto_cancelled','adults','Cande') RETURNING id INTO src_cls;
  INSERT INTO classes (date,start_time,end_time,capacity_ideal,capacity_max,status,audience,teacher)
    VALUES ('2027-03-10','10:30','12:30',6,8,'scheduled','adults','Cande') RETURNING id INTO c;
  INSERT INTO classes (date,start_time,end_time,capacity_ideal,capacity_max,status,audience,teacher)
    VALUES ('2027-03-12','10:30','12:30',6,8,'scheduled','adults','Cande') RETURNING id INTO blk;

  -- existing make-up (root = March) used in class c by u2
  INSERT INTO bookings (student_id,class_id,source,status) VALUES (u2,src_cls,'drop_in','cancelled_recoverable') RETURNING id INTO b_src;
  INSERT INTO bookings (student_id,class_id,source,status) VALUES (u2,c,'makeup','confirmed') RETURNING id INTO b_mk;
  INSERT INTO makeups (student_id,source_booking_id,used_booking_id,expires_at,origin_month)
    VALUES (u2,b_src,b_mk,'2027-04-01 00:00+02','2027-03-01') RETURNING id INTO mk;
  -- normal booking with pending cash + mirrored ledger
  INSERT INTO bookings (student_id,class_id,source,status) VALUES (u,c,'drop_in','reserved') RETURNING id INTO b_norm;
  INSERT INTO payments (student_id,booking_id,amount_cents,status,method,stripe_session_id)
    VALUES (u,b_norm,3000,'pending','cash','cash:test-'||u);
  INSERT INTO ledger_entries (stripe_session_id, amount_cents, status, month)
    VALUES ('cash:test-'||u, 3000, 'Pendiente', '2027-03');
  -- booking in the class that will only be blocked
  INSERT INTO bookings (student_id,class_id,source,status) VALUES (u,blk,'drop_in','reserved') RETURNING id INTO b_blk;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);

  -- 1. Blocking only: bookings untouched
  UPDATE classes SET status = 'cancelled_by_admin' WHERE id = blk;
  SELECT status INTO v_txt FROM bookings WHERE id = b_blk;
  rep := rep || format('block_keeps=%s ', v_txt); ok := ok AND v_txt = 'reserved';

  -- 2. Real cancel
  v := admin_cancel_class(c);
  rep := rep || format('affected=%s(exp 2) ', v); ok := ok AND v = 2;
  SELECT status INTO v_txt FROM classes WHERE id = c; ok := ok AND v_txt = 'cancelled';
  SELECT count(*) INTO v FROM bookings WHERE class_id = c AND status = 'cancelled_recoverable'; ok := ok AND v = 2;
  -- make-up freed, same credit, root month kept, no new credit for u2
  SELECT count(*) INTO v FROM makeups WHERE id = mk AND used_booking_id IS NULL AND origin_month = '2027-03-01'; ok := ok AND v = 1;
  SELECT count(*) INTO v FROM makeups WHERE student_id = u2; rep := rep || format('u2_credits=%s(exp 1) ', v); ok := ok AND v = 1;
  -- new credit for normal booking in March
  SELECT count(*) INTO v FROM makeups WHERE source_booking_id = b_norm AND origin_month = '2027-03-01'; ok := ok AND v = 1;
  -- pending cash voided, ledger removed
  SELECT count(*) INTO v FROM payments WHERE booking_id = b_norm AND status = 'pending'; ok := ok AND v = 0;
  SELECT count(*) INTO v FROM ledger_entries WHERE stripe_session_id = 'cash:test-'||u;
  rep := rep || format('ledger_left=%s(exp 0) ', v); ok := ok AND v = 0;
  SELECT count(*) INTO v FROM notifications WHERE type = 'class_cancelled' AND student_id IN (u,u2);
  rep := rep || format('notifs=%s ', v);

  -- 3. Repeat: idempotent, no duplicates
  v := admin_cancel_class(c); ok := ok AND v = 0;
  SELECT count(*) INTO v FROM makeups WHERE student_id IN (u,u2); rep := rep || format('credits_after_repeat=%s(exp 2) ', v); ok := ok AND v = 2;

  -- 4. Blocked class can then be really cancelled
  v := admin_cancel_class(blk); ok := ok AND v = 1;

  RAISE EXCEPTION 'TEST_RESULT ok=% %', ok, rep;
END
$test$;
