CREATE OR REPLACE FUNCTION public.admin_restore_released_booking(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_booking record; v_amount int; v_booked int; v_key text; v_month date; v_name text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Solo la administración puede restaurar reservas'; END IF;
  SELECT b.*, c.capacity_max INTO v_booking FROM bookings b JOIN classes c ON c.id=b.class_id WHERE b.id=p_booking_id FOR UPDATE OF b;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
  IF v_booking.status NOT IN ('cancelled_lost','cancelled_recoverable') THEN RAISE EXCEPTION 'Esta reserva no está cancelada'; END IF;
  SELECT count(*) INTO v_booked FROM bookings WHERE class_id=v_booking.class_id AND status IN ('reserved','confirmed','attended');
  IF v_booked >= v_booking.capacity_max THEN RAISE EXCEPTION 'La clase está completa'; END IF;
  UPDATE bookings SET status='reserved',cancelled_at=NULL WHERE id=p_booking_id;
  UPDATE payments SET status='failed' WHERE booking_id=p_booking_id AND status='pending';
  IF EXISTS (SELECT 1 FROM payments WHERE booking_id=p_booking_id AND status='confirmed' AND amount_cents>0) THEN
    UPDATE bookings SET status='confirmed' WHERE id=p_booking_id;
    RETURN;
  END IF;
  SELECT a.amount_cents INTO v_amount FROM public.drop_in_amounts(v_booking.student_id,ARRAY[p_booking_id]) a;
  v_month := public.class_billing_month(v_booking.class_id);
  v_key := 'cash:restore:' || gen_random_uuid()::text || ':' || to_char(v_month,'YYYY-MM');
  INSERT INTO payments(student_id,booking_id,amount_cents,status,method,stripe_session_id)
    VALUES(v_booking.student_id,p_booking_id,coalesce(v_amount,0),'pending','cash',v_key);
  SELECT coalesce(nullif(trim(coalesce(name,'')||' '||coalesce(surname,'')),''),email,'Alumna') INTO v_name FROM profiles WHERE id=v_booking.student_id;
  INSERT INTO ledger_entries(entry_date,month,student_name,item,category,amount_cents,method,status,notes,stripe_session_id)
    VALUES((now() AT TIME ZONE 'Europe/Madrid')::date,to_char(v_month,'YYYY-MM'),v_name,'1 clase','Clases',coalesce(v_amount,0),'E','Pendiente','Reserva restaurada por administración',v_key)
    ON CONFLICT(stripe_session_id) DO NOTHING;
  PERFORM public.recalc_month_pending_cash(v_booking.student_id,v_month);
END $$;