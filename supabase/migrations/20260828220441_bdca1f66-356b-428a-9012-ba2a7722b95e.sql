REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_classes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
REVOKE ALL ON FUNCTION public.is_staff() FROM anon;
REVOKE ALL ON FUNCTION public.can_manage_classes() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_classes() TO authenticated, service_role;