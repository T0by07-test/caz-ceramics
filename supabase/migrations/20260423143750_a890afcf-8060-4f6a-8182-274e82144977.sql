-- Phase 6: Notification pipeline groundwork
-- 1) retry_count + dedup_key on notifications

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS dedup_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_active_idx
  ON public.notifications (dedup_key)
  WHERE dedup_key IS NOT NULL AND status IN ('queued','sent');

CREATE INDEX IF NOT EXISTS notifications_processing_idx
  ON public.notifications (status, next_attempt_at)
  WHERE status = 'queued';

-- 2) Generic enqueue function that fans out per-channel based on prefs.
--    Skips inserts whose dedup key already exists active. Safe to call repeatedly.
CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_student_id uuid,
  p_type text,
  p_payload jsonb,
  p_dedup_suffix text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pref text;
  v_email_key text;
  v_wa_key text;
BEGIN
  SELECT notification_preference INTO v_pref
    FROM public.profiles WHERE id = p_student_id;
  IF v_pref IS NULL THEN v_pref := 'both'; END IF;

  v_email_key := p_student_id::text || '|' || p_type || '|email|' || p_dedup_suffix;
  v_wa_key    := p_student_id::text || '|' || p_type || '|whatsapp|' || p_dedup_suffix;

  IF v_pref IN ('both','email_only') THEN
    INSERT INTO public.notifications (student_id, type, channel, payload, status, dedup_key)
    VALUES (p_student_id, p_type, 'email', p_payload, 'queued', v_email_key)
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL AND status IN ('queued','sent') DO NOTHING;
  END IF;

  IF v_pref IN ('both','whatsapp_only') THEN
    INSERT INTO public.notifications (student_id, type, channel, payload, status, dedup_key)
    VALUES (p_student_id, p_type, 'whatsapp', p_payload, 'queued', v_wa_key)
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL AND status IN ('queued','sent') DO NOTHING;
  END IF;
END;
$$;

-- 3) Backfill: when earlier-phase functions inserted channel='email', also fan out to whatsapp
--    according to current pref the next time they fire. We intentionally leave existing rows alone.

-- 4) Reminder enqueue: classes starting in 24-25h (Europe/Madrid). Idempotent via dedup_key.
CREATE OR REPLACE FUNCTION public.enqueue_24h_reminders()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_count int := 0;
  v_row record;
  v_start timestamptz;
BEGIN
  FOR v_row IN
    SELECT b.id AS booking_id, b.student_id, c.id AS class_id, c.date, c.start_time, c.end_time
      FROM public.bookings b
      JOIN public.classes c ON c.id = b.class_id
     WHERE b.status = 'confirmed'
       AND c.status = 'scheduled'
  LOOP
    v_start := ((v_row.date::text || ' ' || v_row.start_time::text)::timestamp)
               AT TIME ZONE 'Europe/Madrid';
    IF v_start > v_now + interval '24 hours' AND v_start <= v_now + interval '25 hours' THEN
      PERFORM public.enqueue_notification(
        v_row.student_id,
        'reminder_24h',
        jsonb_build_object(
          'booking_id', v_row.booking_id,
          'class_id', v_row.class_id,
          'date', v_row.date,
          'start_time', v_row.start_time,
          'end_time', v_row.end_time
        ),
        v_row.booking_id::text
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 5) Monthly summary enqueue: one row per student with an active subscription for current month
CREATE OR REPLACE FUNCTION public.enqueue_monthly_summary()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month date := date_trunc('month', (now() AT TIME ZONE 'Europe/Madrid'))::date;
  v_count int := 0;
  v_row record;
  v_makeups_pending int;
BEGIN
  FOR v_row IN
    SELECT s.student_id, s.credits_total, s.credits_remaining
      FROM public.subscriptions s
     WHERE s.month = v_month
  LOOP
    SELECT count(*) INTO v_makeups_pending
      FROM public.makeups
     WHERE student_id = v_row.student_id
       AND used_booking_id IS NULL
       AND expires_at > now();

    PERFORM public.enqueue_notification(
      v_row.student_id,
      'monthly_summary',
      jsonb_build_object(
        'month', to_char(v_month, 'YYYY-MM'),
        'credits_total', v_row.credits_total,
        'credits_remaining', v_row.credits_remaining,
        'credits_used', v_row.credits_total - v_row.credits_remaining,
        'makeups_pending', v_makeups_pending
      ),
      to_char(v_month, 'YYYY-MM')
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 6) Wrap cancel_booking-created makeups so a notification is enqueued whenever makeups insert.
--    We do this with a trigger that fires AFTER INSERT on public.makeups.
CREATE OR REPLACE FUNCTION public.notify_on_makeup_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_notification(
    NEW.student_id,
    'makeup_available',
    jsonb_build_object(
      'makeup_id', NEW.id,
      'source_booking_id', NEW.source_booking_id,
      'expires_at', NEW.expires_at
    ),
    NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS makeups_notify_on_insert ON public.makeups;
CREATE TRIGGER makeups_notify_on_insert
  AFTER INSERT ON public.makeups
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_makeup_insert();

-- 7) Atomic claim: pull up to N due rows and mark them 'sending'
CREATE OR REPLACE FUNCTION public.claim_notifications(p_limit int)
RETURNS TABLE (
  id uuid,
  student_id uuid,
  type text,
  channel text,
  payload jsonb,
  retry_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT n.id
      FROM public.notifications n
     WHERE n.status = 'queued'
       AND n.next_attempt_at <= now()
     ORDER BY n.created_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notifications n
     SET status = 'sending'
    FROM due
   WHERE n.id = due.id
  RETURNING n.id, n.student_id, n.type, n.channel, n.payload, n.retry_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_sent(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.notifications
     SET status = 'sent', sent_at = now(), last_error = NULL
   WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_failed(p_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_retry int;
BEGIN
  SELECT retry_count INTO v_retry FROM public.notifications WHERE id = p_id;
  IF v_retry IS NULL THEN RETURN; END IF;
  IF v_retry + 1 >= 3 THEN
    UPDATE public.notifications
       SET status = 'failed', retry_count = v_retry + 1, last_error = p_error
     WHERE id = p_id;
  ELSE
    UPDATE public.notifications
       SET status = 'queued',
           retry_count = v_retry + 1,
           last_error = p_error,
           next_attempt_at = now() + (interval '1 minute' * power(2, v_retry + 1))
     WHERE id = p_id;
  END IF;
END;
$$;

-- 8) Admin can SELECT all notifications (already covered by notifications_admin_all). No change.
