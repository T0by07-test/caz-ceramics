-- Block A · A2.1 — Scheduler extensions (pg_cron + pg_net)
--
-- pg_cron drives the in-database schedule; pg_net lets cron jobs invoke our
-- Supabase Edge Functions over HTTP. On Supabase, pg_cron lives in the `cron`
-- schema and pg_net in the `extensions` schema by convention.
--
-- These may already be enabled via Dashboard → Database → Extensions (see the
-- deployment runbook §7.1). CREATE EXTENSION IF NOT EXISTS is idempotent, so
-- running this is safe either way.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
