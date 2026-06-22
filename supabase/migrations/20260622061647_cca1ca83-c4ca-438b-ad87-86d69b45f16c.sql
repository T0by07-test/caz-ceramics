
-- Internal / cron / webhook / trigger helpers — service_role only
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'public.handle_new_user()',
    'public.notify_on_makeup_insert()',
    'public.enqueue_notification(uuid, text, jsonb, text)',
    'public.promote_waitlist(uuid)',
    'public.confirm_drop_in_booking(text)',
    'public.grant_plan_subscription(text, uuid, uuid)',
    'public.fail_payment(text)',
    'public.expire_pending_drop_ins()',
    'public.auto_cancel_low_attendance()',
    'public.enqueue_24h_reminders()',
    'public.enqueue_monthly_summary()',
    'public.claim_notifications(integer)',
    'public.mark_notification_sent(uuid)',
    'public.mark_notification_failed(uuid, text)'
  ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', fn);
  END LOOP;
END $$;

-- Admin-only RPCs — revoke anon; keep authenticated (function checks is_staff/is_admin internally)
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'public.accept_enrollment_request(uuid, uuid[])',
    'public.admin_move_booking(uuid, uuid, text)',
    'public.admin_grant_makeup(uuid, text)',
    'public.mark_attendance(uuid, text)'
  ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', fn);
  END LOOP;
END $$;

-- Student RPCs — authenticated only
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'public.book_class(uuid, text)',
    'public.cancel_booking(uuid)',
    'public.join_waitlist(uuid)',
    'public.purchase_plan_cash(uuid)',
    'public.enroll_from_invite(text)'
  ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', fn);
  END LOOP;
END $$;

-- Public-facing RPCs — anon-callable (intentional, validate input internally)
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'public.create_enrollment_request(text, text, text, text, text, uuid[])',
    'public.redeem_invite(text)'
  ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role;', fn);
  END LOOP;
END $$;
