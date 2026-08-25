ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_student_id_class_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_active_per_student_class
  ON public.bookings (student_id, class_id)
  WHERE status IN ('reserved', 'confirmed', 'attended');

CREATE OR REPLACE FUNCTION public.enroll_from_invite(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile uuid := auth.uid();
  v_invite record;
  v_class record;
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode = '28000';
  END IF;
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'TOKEN_REQUIRED' USING errcode = '22023';
  END IF;

  SELECT id, status, expires_at, profile_id
    INTO v_invite
    FROM public.invites
    WHERE token = p_token
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND' USING errcode = 'P0002';
  END IF;

  IF v_invite.status = 'accepted' AND v_invite.profile_id = v_profile THEN
    RETURN;
  END IF;

  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'INVITE_NOT_PENDING' USING errcode = '22023';
  END IF;
  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'INVITE_EXPIRED' USING errcode = '22023';
  END IF;

  FOR v_class IN
    SELECT ic.class_id
      FROM public.invite_classes ic
      WHERE ic.invite_id = v_invite.id
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.bookings
        WHERE student_id = v_profile
          AND class_id = v_class.class_id
          AND status IN ('reserved','confirmed','attended')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.bookings (student_id, class_id, source, status)
      VALUES (v_profile, v_class.class_id, 'comp', 'confirmed')
    ON CONFLICT (student_id, class_id) WHERE status IN ('reserved', 'confirmed', 'attended') DO NOTHING;
  END LOOP;

  UPDATE public.invites
     SET status = 'accepted',
         accepted_at = now(),
         profile_id = v_profile
   WHERE id = v_invite.id;
END;
$function$;