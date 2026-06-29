
-- 1. Drop unconstrained student INSERT policies. All writes go through SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS bookings_insert_own ON public.bookings;
DROP POLICY IF EXISTS makeups_insert_own ON public.makeups;
DROP POLICY IF EXISTS payments_insert_own ON public.payments;
DROP POLICY IF EXISTS subs_insert_own ON public.subscriptions;
DROP POLICY IF EXISTS waitlist_insert_own ON public.waitlist;

-- 2. Lock down SECURITY DEFINER function execution. Revoke from PUBLIC, then grant explicitly.
REVOKE EXECUTE ON FUNCTION public.book_class(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.join_waitlist(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enroll_from_invite(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purchase_plan_cash(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_invite(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_enrollment_request(text, text, text, text, text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_enrollment_request(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_move_booking(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_grant_makeup(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_attendance(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_plan_subscription(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_drop_in_booking(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_payment(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_pending_drop_ins() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_cancel_low_attendance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_24h_reminders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_monthly_summary() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_notifications(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_notification_sent(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_notification_failed(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.promote_waitlist(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_makeup_insert() FROM PUBLIC, anon, authenticated;

-- Public (anon + authenticated): public signup form + invite preview
GRANT EXECUTE ON FUNCTION public.create_enrollment_request(text, text, text, text, text, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO anon, authenticated;

-- Signed-in students
GRANT EXECUTE ON FUNCTION public.book_class(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_waitlist(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_from_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_plan_cash(uuid) TO authenticated;

-- Admin/staff (function bodies enforce role internally)
GRANT EXECUTE ON FUNCTION public.accept_enrollment_request(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_move_booking(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_makeup(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_attendance(uuid, text) TO authenticated;

-- Service role only (webhooks, cron, notification worker, triggers)
GRANT EXECUTE ON FUNCTION public.grant_plan_subscription(text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_drop_in_booking(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_payment(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_pending_drop_ins() TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_cancel_low_attendance() TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_24h_reminders() TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_monthly_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_notifications(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_notification_sent(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_notification_failed(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.promote_waitlist(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_on_makeup_insert() TO service_role;

-- is_admin / is_staff / can_manage_classes are referenced from RLS policies, so they
-- must remain callable by the calling role. Re-affirm explicit grants (no revoke).
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_classes() TO anon, authenticated, service_role;
