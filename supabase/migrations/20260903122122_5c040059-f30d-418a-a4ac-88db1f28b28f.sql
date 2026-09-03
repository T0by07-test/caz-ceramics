UPDATE public.classes SET status = 'scheduled' WHERE status = 'auto_cancelled' AND date >= '2026-09-01';
SELECT cron.unschedule(13);