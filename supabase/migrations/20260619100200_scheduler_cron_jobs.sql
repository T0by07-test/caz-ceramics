-- Block A · A2.2 — Scheduler cron jobs
--
-- Registers the recurring jobs for Block A. Each job is guarded by a
-- cron.unschedule() inside a DO/EXCEPTION block (matching the existing
-- 'expire-pending-drop-ins' job) so re-running this migration is idempotent.
--
-- The existing 'expire-pending-drop-ins' job (every 5 min) is intentionally
-- left untouched.
--
-- TIME ZONES: pg_cron evaluates schedules in UTC. The studio operates in
-- Europe/Madrid (UTC+1 in winter, UTC+2 in summer / DST). The wall-clock times
-- below are therefore approximate during the half of the year with the "wrong"
-- offset; confirm exact desired local times with the owner (Cande). The two
-- daily/monthly jobs below are pinned to 07:00 UTC (= 08:00 Madrid in winter,
-- 09:00 Madrid in summer).
--
-- process-notifications is the only HTTP job: it POSTs to the Edge Function and
-- forwards the CRON_SECRET via the 'x-cron-secret' header (shared contract #1).
-- The secret is read from Vault (vault.decrypted_secrets, name='CRON_SECRET').
-- If the secret is not yet stored in Vault the header value is NULL and the
-- Edge Function — per the progressive-hardening contract — still accepts the
-- call as long as CRON_SECRET is unset in its own env.

-- 1) process-notifications — every minute (drains the notification queue)
DO $$ BEGIN PERFORM cron.unschedule('process-notifications'); EXCEPTION WHEN others THEN NULL; END $$;
SELECT cron.schedule(
  'process-notifications',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://gqucwldwbfjfxrqwvpqj.supabase.co/functions/v1/process-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET')
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- 2) enqueue-24h-reminders — hourly (queues reminders for classes 24-25h out)
DO $$ BEGIN PERFORM cron.unschedule('enqueue-24h-reminders'); EXCEPTION WHEN others THEN NULL; END $$;
SELECT cron.schedule(
  'enqueue-24h-reminders',
  '0 * * * *',
  $cron$ SELECT public.enqueue_24h_reminders(); $cron$
);

-- 3) enqueue-monthly-summary — 1st of month at 07:00 UTC (~08:00/09:00 Madrid)
DO $$ BEGIN PERFORM cron.unschedule('enqueue-monthly-summary'); EXCEPTION WHEN others THEN NULL; END $$;
SELECT cron.schedule(
  'enqueue-monthly-summary',
  '0 7 1 * *',
  $cron$ SELECT public.enqueue_monthly_summary(); $cron$
);

-- 4) auto-cancel-classes — daily at 07:00 UTC (~08:00/09:00 Madrid; confirm with owner)
DO $$ BEGIN PERFORM cron.unschedule('auto-cancel-classes'); EXCEPTION WHEN others THEN NULL; END $$;
SELECT cron.schedule(
  'auto-cancel-classes',
  '0 7 * * *',
  $cron$ SELECT public.auto_cancel_low_attendance(); $cron$
);
