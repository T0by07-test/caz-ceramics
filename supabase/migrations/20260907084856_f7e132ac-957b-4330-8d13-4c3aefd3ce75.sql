-- 1. Availability counts for ALL scheduled classes (past weeks included)
CREATE OR REPLACE FUNCTION public.public_class_availability()
 RETURNS TABLE(class_id uuid, booked_count integer, capacity_max integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id,
         (SELECT count(*)::int FROM public.bookings b
           WHERE b.class_id = c.id
             AND b.status IN ('reserved','confirmed','attended')),
         c.capacity_max
  FROM public.classes c
  WHERE c.status = 'scheduled'
$function$;

-- 2. Teacher identity on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS teacher_name text;

UPDATE public.profiles SET teacher_name = 'Sofi', role = 'instructora'
 WHERE email = 'sofiacordi@gmail.com';
UPDATE public.profiles SET teacher_name = 'Cande'
 WHERE email = 'zuzacande@gmail.com';

UPDATE public.classes c
   SET instructor_id = p.id
  FROM public.profiles p
 WHERE p.teacher_name = 'Sofi'
   AND c.teacher = 'Sofi'
   AND c.instructor_id IS DISTINCT FROM p.id;

CREATE OR REPLACE FUNCTION public.my_teacher_name()
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select teacher_name from public.profiles where id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.is_instructora()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'instructora')
$function$;

REVOKE EXECUTE ON FUNCTION public.my_teacher_name() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_instructora() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_teacher_name() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_instructora() TO authenticated;

-- 3. Bookings: admins keep full access, instructoras only their own classes
DROP POLICY IF EXISTS bookings_staff_all ON public.bookings;
CREATE POLICY bookings_admin_all ON public.bookings
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY bookings_instructora_select_own_classes ON public.bookings
  FOR SELECT TO authenticated
  USING (
    public.is_instructora()
    AND EXISTS (
      SELECT 1 FROM public.classes c
       WHERE c.id = bookings.class_id
         AND (c.instructor_id = auth.uid()
              OR (public.my_teacher_name() IS NOT NULL AND c.teacher = public.my_teacher_name()))
    )
  );

-- 4. Profiles: instructoras only see students booked in their classes
DROP POLICY IF EXISTS profiles_select_staff ON public.profiles;
CREATE POLICY profiles_instructora_select_own_students ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_instructora()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
        JOIN public.classes c ON c.id = b.class_id
       WHERE b.student_id = profiles.id
         AND b.status IN ('reserved','confirmed','attended')
         AND (c.instructor_id = auth.uid()
              OR (public.my_teacher_name() IS NOT NULL AND c.teacher = public.my_teacher_name()))
    )
  );

-- 5. Class management stays admin-only
CREATE OR REPLACE FUNCTION public.can_manage_classes()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ select public.is_admin(); $function$;

-- 6. Attendance: instructoras only in their own classes
CREATE OR REPLACE FUNCTION public.mark_attendance(p_booking_id uuid, p_status text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_booking record;
  v_class record;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'NOT_ADMIN' USING errcode = '42501';
  END IF;
  IF p_status NOT IN ('attended','confirmed') THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING errcode = '22023';
  END IF;

  SELECT id, student_id, class_id, status INTO v_booking
    FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;
  IF v_booking.status NOT IN ('reserved','confirmed','attended') THEN
    RAISE EXCEPTION 'BOOKING_NOT_ACTIVE';
  END IF;

  IF NOT public.is_admin() THEN
    SELECT instructor_id, teacher INTO v_class FROM public.classes WHERE id = v_booking.class_id;
    IF NOT (v_class.instructor_id = v_admin
            OR (public.my_teacher_name() IS NOT NULL AND v_class.teacher = public.my_teacher_name())) THEN
      RAISE EXCEPTION 'NOT_YOUR_CLASS' USING errcode = '42501';
    END IF;
  END IF;

  UPDATE public.bookings SET status = p_status WHERE id = p_booking_id;

  INSERT INTO public.admin_actions (admin_id, student_id, action_type, reason, metadata)
  VALUES (v_admin, v_booking.student_id, 'mark_attendance', NULL,
    jsonb_build_object(
      'booking_id', p_booking_id,
      'class_id', v_booking.class_id,
      'from_status', v_booking.status,
      'to_status', p_status
    ));
END;
$function$;