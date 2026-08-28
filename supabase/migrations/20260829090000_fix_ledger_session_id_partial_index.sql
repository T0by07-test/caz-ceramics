-- The 2026-08-20 migration created ledger_entries_stripe_session_id_key as a
-- PARTIAL unique index (WHERE stripe_session_id IS NOT NULL). Postgres can
-- only use a partial index as an ON CONFLICT arbiter when the INSERT repeats
-- the exact same WHERE clause in its ON CONFLICT specification — but
-- pay_drop_in_cash_batch's `ON CONFLICT (stripe_session_id) DO NOTHING`
-- doesn't, so every cash payment (single-class or multi) failed with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". A plain (non-partial) UNIQUE constraint fixes this —
-- Postgres already treats multiple NULLs as distinct under a standard
-- UNIQUE, so no existing NULL rows are affected.
DROP INDEX IF EXISTS public.ledger_entries_stripe_session_id_key;
ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_stripe_session_id_key UNIQUE (stripe_session_id);
