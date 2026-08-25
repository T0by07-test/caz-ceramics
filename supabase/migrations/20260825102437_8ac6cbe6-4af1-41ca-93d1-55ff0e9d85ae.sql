REVOKE ALL ON FUNCTION public.enroll_from_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_from_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_from_invite(text) TO service_role;