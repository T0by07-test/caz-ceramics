-- Block C · C3 — widen bookings.source CHECK to include 'comp'
--
-- Comp bookings are free, pre-approved enrollments created by enroll_from_invite
-- when an invitee redeems their token (spec §3 / D-1, comp-only). The original
-- source CHECK only allowed ('plan','drop_in').
--
-- The original constraint is an INLINE table check from the initial schema
-- migration, so Postgres auto-named it 'bookings_source_check'. We resolve the
-- real name defensively (any CHECK on public.bookings whose definition mentions
-- the source literals) so this still works if it was renamed. Idempotent.

DO $$
DECLARE
  v_conname text;
BEGIN
  -- Find any CHECK constraint on public.bookings that constrains the source
  -- column values (matches the known literal set, not other checks).
  SELECT c.conname INTO v_conname
    FROM pg_constraint c
    JOIN pg_class t      ON t.oid = c.conrelid
    JOIN pg_namespace n  ON n.oid = t.relnamespace
   WHERE n.nspname = 'public'
     AND t.relname = 'bookings'
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) ILIKE '%drop_in%'
   LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.bookings DROP CONSTRAINT %I', v_conname);
  END IF;
END$$;

-- Drop by the conventional name too, in case the heuristic above missed it.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_source_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_source_check
  CHECK (source IN ('plan','drop_in','comp'));
