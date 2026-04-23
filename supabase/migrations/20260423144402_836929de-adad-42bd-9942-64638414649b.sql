
-- Audit log for admin manual actions (move student between classes, grant makeup, etc.)
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  student_id uuid,
  action_type text NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_actions_admin_all ON public.admin_actions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS admin_actions_created_at_idx ON public.admin_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_actions_student_idx ON public.admin_actions (student_id);

-- Move a student's active booking from one class to another. Admin only.
CREATE OR REPLACE FUNCTION public.admin_move_booking(
  p_booking_id uuid,
  p_target_class_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_booking record;
  v_target record;
  v_count int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN' USING errcode = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING errcode = '22023';
  END IF;

  SELECT id, student_id, class_id, status, source INTO v_booking
    FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF v_booking.status NOT IN ('reserved','confirmed','attended') THEN
    RAISE EXCEPTION 'BOOKING_NOT_ACTIVE';
  END IF;

  SELECT id, status, capacity_max INTO v_target
    FROM public.classes WHERE id = p_target_class_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_CLASS_NOT_FOUND'; END IF;
  IF v_target.status <> 'scheduled' THEN RAISE EXCEPTION 'TARGET_NOT_SCHEDULED'; END IF;

  SELECT count(*) INTO v_count FROM public.bookings
    WHERE class_id = p_target_class_id AND status IN ('reserved','confirmed','attended');
  IF v_count >= v_target.capacity_max THEN RAISE EXCEPTION 'TARGET_FULL'; END IF;

  -- Ensure student doesn't already have an active booking on target
  IF EXISTS (
    SELECT 1 FROM public.bookings
     WHERE class_id = p_target_class_id AND student_id = v_booking.student_id
       AND status IN ('reserved','confirmed','attended')
  ) THEN RAISE EXCEPTION 'ALREADY_BOOKED_TARGET'; END IF;

  UPDATE public.bookings SET class_id = p_target_class_id WHERE id = p_booking_id;

  INSERT INTO public.admin_actions (admin_id, student_id, action_type, reason, metadata)
  VALUES (v_admin, v_booking.student_id, 'move_booking', p_reason,
    jsonb_build_object('booking_id', p_booking_id,
                       'from_class_id', v_booking.class_id,
                       'to_class_id', p_target_class_id));

  PERFORM public.promote_waitlist(v_booking.class_id);
END;
$$;

-- Manually grant a makeup credit to a student. Admin only.
CREATE OR REPLACE FUNCTION public.admin_grant_makeup(
  p_student_id uuid,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_synthetic_booking uuid;
  v_makeup_id uuid;
  v_expires timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'NOT_ADMIN' USING errcode = '42501'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING errcode = '22023';
  END IF;

  v_expires := ((date_trunc('month', (now() AT TIME ZONE 'Europe/Madrid')::date)
                 + interval '1 month' - interval '1 day')::date::text
                || ' 23:59:00')::timestamp AT TIME ZONE 'Europe/Madrid';

  -- Use a placeholder source booking: pick any past booking of the student, else NULL not allowed.
  -- We require a source_booking_id (NOT NULL); use the student's most recent booking if any.
  SELECT id INTO v_synthetic_booking FROM public.bookings
    WHERE student_id = p_student_id ORDER BY created_at DESC LIMIT 1;
  IF v_synthetic_booking IS NULL THEN
    RAISE EXCEPTION 'NO_BOOKING_HISTORY';
  END IF;

  INSERT INTO public.makeups (student_id, source_booking_id, expires_at)
    VALUES (p_student_id, v_synthetic_booking, v_expires)
    RETURNING id INTO v_makeup_id;

  INSERT INTO public.admin_actions (admin_id, student_id, action_type, reason, metadata)
  VALUES (v_admin, p_student_id, 'grant_makeup', p_reason,
    jsonb_build_object('makeup_id', v_makeup_id, 'expires_at', v_expires));

  RETURN v_makeup_id;
END;
$$;
