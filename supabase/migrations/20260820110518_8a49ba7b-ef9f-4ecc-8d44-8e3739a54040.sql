DROP FUNCTION IF EXISTS public.grant_plan_subscription(text, uuid, uuid);
DROP FUNCTION IF EXISTS public.purchase_plan_cash(uuid);

REVOKE ALL ON FUNCTION public.enqueue_plan_renewal_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_plan_renewal_reminders() TO service_role;

REVOKE ALL ON FUNCTION public.grant_plan_subscription(text, uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_plan_subscription(text, uuid, uuid, date) TO service_role;

REVOKE ALL ON FUNCTION public.pay_drop_in_cash(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_drop_in_cash(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.purchase_plan_cash(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_plan_cash(uuid, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_plan_month(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_plan_month(date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.book_class(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_class(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.expire_pending_drop_ins() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_pending_drop_ins() TO service_role;