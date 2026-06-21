-- Block A · A1.3 — notifications status CHECK bugfix
--
-- claim_notifications() sets status = 'sending', but the original CHECK only
-- allowed ('queued','sent','failed'), so claiming a row raised a constraint
-- violation. Widen the allowed set to include 'sending'.
--
-- The original constraint is an INLINE table check defined in the initial
-- schema migration, so Postgres auto-named it 'notifications_status_check'.
-- We still resolve the real name defensively (any CHECK on public.notifications
-- whose definition mentions the status column / its literals) so this works
-- even if the constraint was renamed by an earlier change. Idempotent.

DO $$
DECLARE
  v_conname text;
BEGIN
  -- Find any CHECK constraint on public.notifications that constrains the
  -- status column values (matches the known literal set, not other checks).
  SELECT c.conname INTO v_conname
    FROM pg_constraint c
    JOIN pg_class t      ON t.oid = c.conrelid
    JOIN pg_namespace n  ON n.oid = t.relnamespace
   WHERE n.nspname = 'public'
     AND t.relname = 'notifications'
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) ILIKE '%queued%'
   LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', v_conname);
  END IF;
END$$;

-- Drop by the conventional name too, in case the heuristic above missed it.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_status_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_status_check
  CHECK (status IN ('queued','sending','sent','failed'));
