-- Block A · A2.1 — Scheduler extensions (pg_cron + pg_net)
--
-- pg_cron drives an in-database schedule; pg_net lets cron jobs call Edge
-- Functions over HTTP.
--
-- LOVABLE CLOUD NOTE: the managed database may not permit enabling these
-- extensions (no direct DB/service access). We therefore wrap each CREATE
-- EXTENSION in an exception-tolerant block so a missing/forbidden extension
-- does NOT abort the whole migration batch — the rest of Block A/B/C must still
-- apply. If these no-op, scheduling is done by an EXTERNAL HTTP scheduler
-- hitting the CRON_SECRET-protected endpoints instead of pg_cron.

DO $$
BEGIN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not enabled (%) — use an external scheduler', SQLERRM;
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net not enabled (%) — use an external scheduler', SQLERRM;
END $$;
