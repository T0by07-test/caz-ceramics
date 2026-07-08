
-- Lock down internal-only SECURITY DEFINER functions.
-- These are only invoked by triggers, cron jobs, other definer functions, or the
-- service role (which bypasses grants). Revoking EXECUTE from PUBLIC/anon/authenticated
-- closes the Supabase linter warnings for anon/authenticated definer executability.

DO $$
DECLARE
  fn text;
  internal_fns text[] := ARRAY[
    'public.handle_new_user()',
    'public.notify_on_makeup_insert()',
    'public.enqueue_notification(uuid, text, jsonb, text)',
    'public.promote_waitlist(uuid)',
    'public.mark_notification_sent(uuid)',
    'public.mark_notification_failed(uuid, text)',
    'public.claim_notifications(integer)',
    'public.confirm_drop_in_booking(text)',
    'public.fail_payment(text)',
    'public.grant_plan_subscription(text, uuid, uuid)',
    'public.expire_pending_drop_ins()',
    'public.enqueue_24h_reminders()',
    'public.enqueue_monthly_summary()',
    'public.auto_cancel_low_attendance()'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
