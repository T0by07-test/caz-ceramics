-- Block C · C4 — enrollment + invite RPCs
--
-- Four SECURITY DEFINER RPCs that drive the request -> accept -> invite ->
-- enroll(comp) flow (spec §4). All run as definer with a pinned search_path,
-- mirroring the existing book_class / admin_grant_makeup conventions.
--
-- Shared contract:
--   create_enrollment_request(name,surname,email,whatsapp,message,class_ids[]) -> uuid
--     anon-callable; validates >= 1 class; inserts request + request_classes.
--   redeem_invite(token) -> jsonb
--     anon-callable; returns { status, name, surname, email, whatsapp,
--     classes:[{id,date,start_time,end_time}] } for the invite page.
--   accept_enrollment_request(request_id, granted_class_ids[]) -> text
--     admin only; marks request accepted, sets granted flags, creates invite +
--     invite_classes, returns the invite token. COMP-ONLY (no payment_mode).
--   enroll_from_invite(token) -> void
--     authenticated; uses auth.uid() as profile; books confirmed comp bookings
--     for each invite_classes row, bypassing capacity/credit; idempotent.

-- =========================================================================
-- create_enrollment_request: public (anon) class-enrollment request
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_enrollment_request(
  p_name text,
  p_surname text,
  p_email text,
  p_whatsapp text,
  p_message text,
  p_class_ids uuid[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id uuid;
  v_class_id uuid;
  v_valid_count int;
BEGIN
  -- Basic field validation (abuse brake, spec R2).
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'NAME_REQUIRED' USING errcode = '22023';
  END IF;
  IF p_surname IS NULL OR length(trim(p_surname)) = 0 THEN
    RAISE EXCEPTION 'SURNAME_REQUIRED' USING errcode = '22023';
  END IF;
  IF p_email IS NULL OR p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'INVALID_EMAIL' USING errcode = '22023';
  END IF;

  -- Require at least one requested class (spec §8.3: v1 demands >= 1 class).
  IF p_class_ids IS NULL OR array_length(p_class_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'CLASSES_REQUIRED' USING errcode = '22023';
  END IF;

  -- Cap the number of requested classes as an abuse brake.
  IF array_length(p_class_ids, 1) > 20 THEN
    RAISE EXCEPTION 'TOO_MANY_CLASSES' USING errcode = '22023';
  END IF;

  -- All referenced classes must exist and be scheduled.
  SELECT count(DISTINCT id) INTO v_valid_count
    FROM public.classes
    WHERE id = ANY(p_class_ids)
      AND status = 'scheduled';
  IF v_valid_count = 0 THEN
    RAISE EXCEPTION 'NO_VALID_CLASSES' USING errcode = '22023';
  END IF;

  INSERT INTO public.enrollment_requests (name, surname, email, whatsapp, message, status)
    VALUES (trim(p_name), trim(p_surname), lower(trim(p_email)),
            nullif(trim(coalesce(p_whatsapp, '')), ''),
            nullif(trim(coalesce(p_message, '')), ''),
            'pending')
    RETURNING id INTO v_request_id;

  -- Link the (valid, distinct) requested classes.
  INSERT INTO public.enrollment_request_classes (request_id, class_id)
  SELECT v_request_id, c.id
    FROM public.classes c
    WHERE c.id = ANY(p_class_ids)
      AND c.status = 'scheduled'
  ON CONFLICT (request_id, class_id) DO NOTHING;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_enrollment_request(text, text, text, text, text, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.create_enrollment_request(text, text, text, text, text, uuid[]) TO anon, authenticated;

-- =========================================================================
-- redeem_invite: token lookup for the invite (/unirse) page
-- =========================================================================
CREATE OR REPLACE FUNCTION public.redeem_invite(
  p_token text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_effective_status text;
  v_classes jsonb;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'TOKEN_REQUIRED' USING errcode = '22023';
  END IF;

  SELECT id, token, name, surname, email, whatsapp, status, expires_at
    INTO v_invite
    FROM public.invites
    WHERE token = p_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND' USING errcode = 'P0002';
  END IF;

  -- Surface an 'expired' status for pending-but-past-expiry invites without
  -- needing a write here.
  v_effective_status := v_invite.status;
  IF v_invite.status = 'pending' AND v_invite.expires_at < now() THEN
    v_effective_status := 'expired';
  END IF;

  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', c.id,
               'date', c.date,
               'start_time', c.start_time,
               'end_time', c.end_time
             )
             ORDER BY c.date, c.start_time
           ),
           '[]'::jsonb
         )
    INTO v_classes
    FROM public.invite_classes ic
    JOIN public.classes c ON c.id = ic.class_id
    WHERE ic.invite_id = v_invite.id;

  RETURN jsonb_build_object(
    'status', v_effective_status,
    'name', v_invite.name,
    'surname', v_invite.surname,
    'email', v_invite.email,
    'whatsapp', v_invite.whatsapp,
    'classes', v_classes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_invite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO anon, authenticated;

-- =========================================================================
-- accept_enrollment_request: admin accepts a request, mints an invite
-- =========================================================================
CREATE OR REPLACE FUNCTION public.accept_enrollment_request(
  p_request_id uuid,
  p_granted_class_ids uuid[]
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_request record;
  v_token text;
  v_invite_id uuid;
  v_granted_count int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN' USING errcode = '42501';
  END IF;

  IF p_granted_class_ids IS NULL OR array_length(p_granted_class_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'CLASSES_REQUIRED' USING errcode = '22023';
  END IF;

  SELECT id, name, surname, email, whatsapp, status
    INTO v_request
    FROM public.enrollment_requests
    WHERE id = p_request_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING errcode = 'P0002';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'REQUEST_NOT_PENDING' USING errcode = '22023';
  END IF;

  -- Granted classes must belong to this request (granted is a subset of requested).
  SELECT count(*) INTO v_granted_count
    FROM public.enrollment_request_classes erc
    WHERE erc.request_id = p_request_id
      AND erc.class_id = ANY(p_granted_class_ids);
  IF v_granted_count = 0 THEN
    RAISE EXCEPTION 'NO_VALID_GRANTED_CLASSES' USING errcode = '22023';
  END IF;

  -- Mark the request accepted.
  UPDATE public.enrollment_requests
     SET status = 'accepted',
         reviewed_at = now(),
         reviewed_by = v_admin
   WHERE id = p_request_id;

  -- Flag the granted request classes.
  UPDATE public.enrollment_request_classes
     SET granted = true
   WHERE request_id = p_request_id
     AND class_id = ANY(p_granted_class_ids);

  -- Generate a URL-safe random token (base64url of 24 random bytes).
  v_token := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');

  INSERT INTO public.invites (
    token, name, surname, email, whatsapp, request_id, status, created_by
  ) VALUES (
    v_token, v_request.name, v_request.surname, v_request.email,
    v_request.whatsapp, p_request_id, 'pending', v_admin
  ) RETURNING id INTO v_invite_id;

  -- Attach the granted classes to the invite (only those actually on the request).
  INSERT INTO public.invite_classes (invite_id, class_id)
  SELECT v_invite_id, erc.class_id
    FROM public.enrollment_request_classes erc
    WHERE erc.request_id = p_request_id
      AND erc.class_id = ANY(p_granted_class_ids)
  ON CONFLICT (invite_id, class_id) DO NOTHING;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_enrollment_request(uuid, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_enrollment_request(uuid, uuid[]) TO authenticated;

-- =========================================================================
-- enroll_from_invite: invitee redeems token -> comp bookings (idempotent)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.enroll_from_invite(
  p_token text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Idempotency: if already accepted by this same profile, nothing to do.
  IF v_invite.status = 'accepted' AND v_invite.profile_id = v_profile THEN
    RETURN;
  END IF;

  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'INVITE_NOT_PENDING' USING errcode = '22023';
  END IF;
  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'INVITE_EXPIRED' USING errcode = '22023';
  END IF;

  -- Book each invite class as a confirmed comp booking. Admin pre-approved,
  -- so we bypass capacity and credit checks. Idempotent per (student, class)
  -- via the bookings unique constraint: skip if an active booking exists, and
  -- ON CONFLICT DO NOTHING guards the cancelled-row edge.
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
    ON CONFLICT (student_id, class_id) DO NOTHING;
  END LOOP;

  -- Mark the invite accepted and bind it to the profile.
  UPDATE public.invites
     SET status = 'accepted',
         accepted_at = now(),
         profile_id = v_profile
   WHERE id = v_invite.id;
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_from_invite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.enroll_from_invite(text) TO authenticated;
