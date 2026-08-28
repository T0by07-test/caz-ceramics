-- Found during the migrations-vs-live-schema audit (2026-08-28): the
-- supabase_realtime publication had ZERO tables in it, meaning every
-- `.channel(...).on("postgres_changes", ...)` subscription in the app has
-- been silently inert. Views that only refetch on mount/dialog-open (e.g. the
-- admin class roster) always show the true state, while anything relying on
-- a background live update (e.g. the calendar's booked-count badge) can
-- drift stale until the page is reloaded — which is what caused the
-- "6/7 reservadas" badge to disagree with the roster list showing 2 alumnas.
--
-- Tables below are every table referenced by a `table: "..."` postgres_changes
-- filter in src/.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bookings', 'classes', 'enrollment_requests', 'ledger_entries',
    'makeups', 'notifications', 'subscriptions', 'waitlist'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
