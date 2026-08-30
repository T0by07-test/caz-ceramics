-- Replaces the admin-delete-member Edge Function (couldn't be deployed on
-- this Lovable-managed project — no direct Supabase CLI/login access) with a
-- plain Postgres RPC. auth.users is a real table owned by the migration
-- role, which already has the privileges GoTrue itself uses, so deleting
-- from it directly here works the same way the Admin API would: it cascades
-- through auth.identities/sessions/refresh_tokens, and through
-- profiles -> bookings/payments/tags/subscriptions/recurring_slots/makeups
-- via the existing "on delete cascade" foreign keys.
--
-- Same safety checks as before: caller must be admin, target role must be
-- exactly 'user' (never admin/instructora), and the target must have no
-- payment with amount_cents > 0 — the $0 placeholder rows book_class()
-- inserts for every drop-in attempt don't count, or this would block
-- deleting exactly the test accounts it's meant for.

CREATE OR REPLACE FUNCTION public.admin_delete_member(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target record;
  v_real_payment_count int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING errcode = '42501';
  END IF;

  SELECT id, role INTO v_target FROM public.profiles WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING errcode = 'P0002';
  END IF;
  IF v_target.role <> 'user' THEN
    RAISE EXCEPTION 'ONLY_MEMBERS_CAN_BE_DELETED' USING errcode = '22023';
  END IF;

  SELECT count(*) INTO v_real_payment_count
    FROM public.payments
    WHERE student_id = p_student_id AND amount_cents > 0;
  IF v_real_payment_count > 0 THEN
    RAISE EXCEPTION 'HAS_REAL_PAYMENTS' USING errcode = '22023';
  END IF;

  DELETE FROM auth.users WHERE id = p_student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_member(uuid) TO authenticated;
