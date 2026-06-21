-- Block A · A2.2 — Scheduler cron jobs
--
-- Registers the recurring jobs for Block A IF pg_cron is available.
--
-- LOVABLE CLOUD NOTE: pg_cron is not the supported scheduling path on Lovable
-- Cloud (no direct DB/service access). Each job below is wrapped in an
-- exception-tolerant DO block, so if the `cron` schema does not exist this
-- migration NO-OPS instead of bricking the batch. In that case, schedule these
-- externally (e.g. cron-job.org / Crontap / Inngest):
--   * POST .../functions/v1/process-notifications  every minute   (header x-cron-secret: <CRON_SECRET>)
--   * POST .../api/public/hooks/auto-cancel-classes daily          (header x-cron-secret: <CRON_SECRET>)
--   * enqueue_24h_reminders() / enqueue_monthly_summary() are SQL RPCs — trigger
--     them via a small wrapper Edge Function hit by the external scheduler.
--
-- TIME ZONES: pg_cron evaluates in UTC; the studio is Europe/Madrid (DST). The
-- daily/monthly jobs are pinned to 07:00 UTC; confirm exact local times.
-- The existing 'expire-pending-drop-ins' job is intentionally left untouched.

-- 1) process-notifications — every minute (drains the notification queue)
DO $do$
BEGIN
  BEGIN PERFORM cron.unschedule('process-notifications'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule(
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
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'process-notifications cron not scheduled (%) — schedule externally', SQLERRM;
END $do$;

-- 2) enqueue-24h-reminders — hourly
DO $do$
BEGIN
  BEGIN PERFORM cron.unschedule('enqueue-24h-reminders'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('enqueue-24h-reminders', '0 * * * *', $cron$ SELECT public.enqueue_24h_reminders(); $cron$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'enqueue-24h-reminders cron not scheduled (%) — schedule externally', SQLERRM;
END $do$;

-- 3) enqueue-monthly-summary — 1st of month at 07:00 UTC
DO $do$
BEGIN
  BEGIN PERFORM cron.unschedule('enqueue-monthly-summary'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('enqueue-monthly-summary', '0 7 1 * *', $cron$ SELECT public.enqueue_monthly_summary(); $cron$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'enqueue-monthly-summary cron not scheduled (%) — schedule externally', SQLERRM;
END $do$;

-- 4) auto-cancel-classes — daily at 07:00 UTC
DO $do$
BEGIN
  BEGIN PERFORM cron.unschedule('auto-cancel-classes'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('auto-cancel-classes', '0 7 * * *', $cron$ SELECT public.auto_cancel_low_attendance(); $cron$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'auto-cancel-classes cron not scheduled (%) — schedule externally', SQLERRM;
END $do$;
