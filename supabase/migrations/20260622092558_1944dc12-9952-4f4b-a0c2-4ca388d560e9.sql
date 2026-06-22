DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND membership_status IS NOT DISTINCT FROM (SELECT p.membership_status FROM public.profiles p WHERE p.id = auth.uid())
    AND is_regular IS NOT DISTINCT FROM (SELECT p.is_regular FROM public.profiles p WHERE p.id = auth.uid())
  );