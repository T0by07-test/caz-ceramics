DO $migration$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.admin_restore_released_booking(uuid)'::regprocedure);
  n := replace(d, 'IF EXISTS (SELECT 1 FROM payments WHERE booking_id=p_booking_id AND status=''confirmed'' AND amount_cents>0) THEN',
    'IF v_booking.source <> ''drop_in'' OR EXISTS (SELECT 1 FROM payments WHERE booking_id=p_booking_id AND status=''confirmed'' AND amount_cents>0) THEN');
  IF n=d THEN RAISE EXCEPTION 'Unexpected restore definition'; END IF;
  EXECUTE n;
END $migration$;