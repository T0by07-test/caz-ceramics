-- 1) Scope staff/admin policies to signed-in users only
ALTER POLICY admin_actions_admin_all ON public.admin_actions TO authenticated;
ALTER POLICY bookings_staff_all ON public.bookings TO authenticated;
ALTER POLICY bookings_select_own ON public.bookings TO authenticated;
ALTER POLICY classes_staff_all ON public.classes TO authenticated;
ALTER POLICY commission_rates_admin_all ON public.commission_rates TO authenticated;
ALTER POLICY enrollment_request_classes_admin_all ON public.enrollment_request_classes TO authenticated;
ALTER POLICY enrollment_requests_admin_all ON public.enrollment_requests TO authenticated;
ALTER POLICY expense_admin_all ON public.expense_entries TO authenticated;
ALTER POLICY finance_settings_admin_all ON public.finance_settings TO authenticated;
ALTER POLICY invite_classes_admin_all ON public.invite_classes TO authenticated;
ALTER POLICY invites_admin_all ON public.invites TO authenticated;
ALTER POLICY ledger_admin_all ON public.ledger_entries TO authenticated;
ALTER POLICY makeups_admin_all ON public.makeups TO authenticated;
ALTER POLICY notifications_admin_all ON public.notifications TO authenticated;
ALTER POLICY payments_admin_all ON public.payments TO authenticated;
ALTER POLICY plans_admin_all ON public.plans TO authenticated;
ALTER POLICY profile_tags_admin_all ON public.profile_tags TO authenticated;
ALTER POLICY profile_tags_select_staff ON public.profile_tags TO authenticated;
ALTER POLICY profiles_admin_all ON public.profiles TO authenticated;
ALTER POLICY profiles_select_staff ON public.profiles TO authenticated;
ALTER POLICY recurring_slots_select_own_or_staff ON public.recurring_slots TO authenticated;
ALTER POLICY recurring_slots_admin_all ON public.recurring_slots TO authenticated;
ALTER POLICY subs_admin_all ON public.subscriptions TO authenticated;
ALTER POLICY tags_admin_all ON public.tags TO authenticated;
ALTER POLICY tags_select_staff ON public.tags TO authenticated;
ALTER POLICY waitlist_staff_all ON public.waitlist TO authenticated;

-- 2) Anonymous visitors can no longer execute the role-check helpers
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_classes() FROM anon;

-- 3) Public (anonymous) class visibility limited to upcoming classes only
DROP POLICY IF EXISTS classes_select_scheduled_anon ON public.classes;
CREATE POLICY classes_select_scheduled_anon ON public.classes
  FOR SELECT TO anon
  USING (
    status = 'scheduled'
    AND date >= ((now() AT TIME ZONE 'Europe/Madrid')::date - interval '1 day')
  );
