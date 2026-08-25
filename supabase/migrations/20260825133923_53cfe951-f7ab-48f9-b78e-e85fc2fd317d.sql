CREATE OR REPLACE FUNCTION public.accept_enrollment_request(p_request_id uuid, p_granted_class_ids uuid[])
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  SELECT count(*) INTO v_granted_count
    FROM public.enrollment_request_classes erc
    WHERE erc.request_id = p_request_id
      AND erc.class_id = ANY(p_granted_class_ids);
  IF v_granted_count = 0 THEN
    RAISE EXCEPTION 'NO_VALID_GRANTED_CLASSES' USING errcode = '22023';
  END IF;

  UPDATE public.enrollment_requests
     SET status = 'accepted',
         reviewed_at = now(),
         reviewed_by = v_admin
   WHERE id = p_request_id;

  UPDATE public.enrollment_request_classes
     SET granted = true
   WHERE request_id = p_request_id
     AND class_id = ANY(p_granted_class_ids);

  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');

  INSERT INTO public.invites (
    token, name, surname, email, whatsapp, request_id, status, created_by
  ) VALUES (
    v_token, v_request.name, v_request.surname, v_request.email,
    v_request.whatsapp, p_request_id, 'pending', v_admin
  ) RETURNING id INTO v_invite_id;

  INSERT INTO public.invite_classes (invite_id, class_id)
  SELECT v_invite_id, erc.class_id
    FROM public.enrollment_request_classes erc
    WHERE erc.request_id = p_request_id
      AND erc.class_id = ANY(p_granted_class_ids)
  ON CONFLICT (invite_id, class_id) DO NOTHING;

  RETURN v_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_enrollment_request(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_enrollment_request(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_enrollment_request(uuid, uuid[]) TO service_role;