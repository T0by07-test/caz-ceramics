CREATE OR REPLACE FUNCTION public.accept_paid_enrollment_request(p_request_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request record;
  v_token text;
  v_invite_id uuid;
BEGIN
  SELECT id, name, surname, email, whatsapp, status
    INTO v_request
    FROM public.enrollment_requests
    WHERE id = p_request_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING errcode = 'P0002';
  END IF;
  IF v_request.status <> 'pending' THEN
    RETURN NULL;
  END IF;

  UPDATE public.enrollment_requests
     SET status = 'accepted',
         reviewed_at = now()
   WHERE id = p_request_id;

  UPDATE public.enrollment_request_classes
     SET granted = true
   WHERE request_id = p_request_id;

  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');

  INSERT INTO public.invites (
    token, name, surname, email, whatsapp, request_id, status
  ) VALUES (
    v_token, v_request.name, v_request.surname, v_request.email,
    v_request.whatsapp, p_request_id, 'pending'
  ) RETURNING id INTO v_invite_id;

  INSERT INTO public.invite_classes (invite_id, class_id)
  SELECT v_invite_id, erc.class_id
    FROM public.enrollment_request_classes erc
    WHERE erc.request_id = p_request_id
  ON CONFLICT (invite_id, class_id) DO NOTHING;

  RETURN v_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_paid_enrollment_request(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_paid_enrollment_request(uuid) TO service_role;