-- ============================================================================
-- Cazu Ceramics — Schema changes to apply in Lovable Cloud (SQL editor)
-- Lovable Cloud does NOT auto-run repo migration files, so run this once here.
-- All statements are idempotent / exception-tolerant (safe to re-run).
-- Covers: Block A (notifications/scheduler/attendance), Block B+C v1
-- (enrollment requests, invites, comp source), plan prices + cash payment.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Seed/upsert the monthly plans (this DB shows plans = 0 rows).
--    Prices: 1->35, 2->50, 3->65, 4->80 EUR. Lookup keys must match Stripe.
-- ---------------------------------------------------------------------------
INSERT INTO public.plans (name, classes_per_month, price_cents, stripe_price_id, active)
SELECT 'Plan 1 clase / mes', 1, 3500, 'plan_1_class_month', true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE classes_per_month = 1);
INSERT INTO public.plans (name, classes_per_month, price_cents, stripe_price_id, active)
SELECT 'Plan 2 clases / mes', 2, 5000, 'plan_2_class_month', true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE classes_per_month = 2);
INSERT INTO public.plans (name, classes_per_month, price_cents, stripe_price_id, active)
SELECT 'Plan 3 clases / mes', 3, 6500, 'plan_3_class_month', true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE classes_per_month = 3);
INSERT INTO public.plans (name, classes_per_month, price_cents, stripe_price_id, active)
SELECT 'Plan 4 clases / mes', 4, 8000, 'plan_4_class_month', true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE classes_per_month = 4);



-- ===== 20260619100000_notifications_status_check.sql =====
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


-- ===== 20260619100400_mark_attendance_rpc.sql =====
-- Block A · A4.1 — mark_attendance RPC (admin check-in)
--
-- Lets an admin mark a booking as attended (check-in) or undo it back to
-- confirmed. Modeled on the existing admin RPCs (admin_move_booking /
-- admin_grant_makeup): SECURITY DEFINER, is_admin() guard, writes an
-- admin_actions audit row.
--
-- Shared contract #2:
--   public.mark_attendance(p_booking_id uuid, p_status text)
--   p_status = 'attended' (mark present) | 'confirmed' (undo)
--   Updates public.bookings.status, inserts an admin_actions row
--   (action_type = 'mark_attendance'). Granted to authenticated.
--   Frontend: supabase.rpc('mark_attendance', { p_booking_id, p_status }).
--
-- Note: bookings.status already allows both 'attended' and 'confirmed' in its
-- CHECK constraint, so no table alteration is needed. Per spec A4 the default
-- scope is "record only" — there is no no_show status in Block A.

CREATE OR REPLACE FUNCTION public.mark_attendance(
  p_booking_id uuid,
  p_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_booking record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN' USING errcode = '42501';
  END IF;

  IF p_status NOT IN ('attended','confirmed') THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING errcode = '22023';
  END IF;

  SELECT id, student_id, class_id, status INTO v_booking
    FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  -- Only an active (non-cancelled) booking can be checked in / undone.
  IF v_booking.status NOT IN ('reserved','confirmed','attended') THEN
    RAISE EXCEPTION 'BOOKING_NOT_ACTIVE';
  END IF;

  UPDATE public.bookings SET status = p_status WHERE id = p_booking_id;

  INSERT INTO public.admin_actions (admin_id, student_id, action_type, reason, metadata)
  VALUES (v_admin, v_booking.student_id, 'mark_attendance', NULL,
    jsonb_build_object(
      'booking_id', p_booking_id,
      'class_id', v_booking.class_id,
      'from_status', v_booking.status,
      'to_status', p_status
    ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_attendance(uuid, text) TO authenticated;


-- ===== 20260619100500_enrollment_requests.sql =====
-- Block C · C1 — enrollment_requests + enrollment_request_classes
--
-- Public class-enrollment requests from interested people who do NOT yet have an
-- account. A request carries contact details + a free-text message and references
-- one or more requested classes.
--
-- RLS model (spec §3, R3):
--   * anon has NO direct INSERT/SELECT — public writes happen ONLY through the
--     SECURITY DEFINER RPC create_enrollment_request (added in a later migration).
--   * Only is_admin() may SELECT / UPDATE (review + accept/reject flow).
-- Idempotent: guarded with IF NOT EXISTS / drop-before-create on policies.

-- ============ TABLES ============

CREATE TABLE IF NOT EXISTS public.enrollment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  surname text NOT NULL,
  email text NOT NULL,
  whatsapp text,
  message text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.enrollment_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.enrollment_request_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.enrollment_requests(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  granted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, class_id)
);
ALTER TABLE public.enrollment_request_classes ENABLE ROW LEVEL SECURITY;

-- ============ INDEXES ============

CREATE INDEX IF NOT EXISTS enrollment_requests_status_idx
  ON public.enrollment_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS enrollment_requests_email_idx
  ON public.enrollment_requests (email);
CREATE INDEX IF NOT EXISTS enrollment_request_classes_request_idx
  ON public.enrollment_request_classes (request_id);
CREATE INDEX IF NOT EXISTS enrollment_request_classes_class_idx
  ON public.enrollment_request_classes (class_id);

-- ============ RLS POLICIES ============
-- Admin-only read/write. No anon/authenticated direct access; public inserts go
-- through the SECURITY DEFINER RPC create_enrollment_request.

DROP POLICY IF EXISTS "enrollment_requests_admin_all" ON public.enrollment_requests;
CREATE POLICY "enrollment_requests_admin_all"
  ON public.enrollment_requests
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "enrollment_request_classes_admin_all" ON public.enrollment_request_classes;
CREATE POLICY "enrollment_request_classes_admin_all"
  ON public.enrollment_request_classes
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ===== 20260619100600_invites.sql =====
-- Block C · C2 — invites + invite_classes
--
-- An invite is the admission mechanism (spec §3): after an admin accepts an
-- enrollment_request, an invite token is minted. The invitee opens
-- /unirse/<token>, creates an account, and is auto-enrolled (comp) into the
-- invite_classes rows.
--
-- RLS model (spec §3, R3):
--   * Only is_admin() may read/write the rows directly.
--   * The invitee NEVER reads these tables directly — token lookup + redemption
--     happen via the SECURITY DEFINER RPCs redeem_invite / enroll_from_invite
--     (added in a later migration), which bypass RLS.
-- Idempotent: IF NOT EXISTS / drop-before-create on policies.

-- ============ TABLES ============

CREATE TABLE IF NOT EXISTS public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  name text,
  surname text,
  email text,
  whatsapp text,
  request_id uuid REFERENCES public.enrollment_requests(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','expired','revoked')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.invite_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES public.invites(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invite_id, class_id)
);
ALTER TABLE public.invite_classes ENABLE ROW LEVEL SECURITY;

-- ============ INDEXES ============

-- token already has a UNIQUE index from the column constraint; add status helper.
CREATE INDEX IF NOT EXISTS invites_status_idx
  ON public.invites (status, expires_at);
CREATE INDEX IF NOT EXISTS invites_request_idx
  ON public.invites (request_id);
CREATE INDEX IF NOT EXISTS invites_profile_idx
  ON public.invites (profile_id);
CREATE INDEX IF NOT EXISTS invite_classes_invite_idx
  ON public.invite_classes (invite_id);
CREATE INDEX IF NOT EXISTS invite_classes_class_idx
  ON public.invite_classes (class_id);

-- ============ RLS POLICIES ============
-- Admin-only direct access. Token-based redemption uses SECURITY DEFINER RPCs.

DROP POLICY IF EXISTS "invites_admin_all" ON public.invites;
CREATE POLICY "invites_admin_all"
  ON public.invites
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "invite_classes_admin_all" ON public.invite_classes;
CREATE POLICY "invite_classes_admin_all"
  ON public.invite_classes
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ===== 20260619100700_widen_bookings_source_comp.sql =====
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


-- ===== 20260619100800_enrollment_invite_rpcs.sql =====
-- Block C · C4 — enrollment + invite RPCs
--
-- Four SECURITY DEFINER RPCs that drive the request -> accept -> invite ->
-- enroll(comp) flow (spec §4). All run as definer with a pinned search_path,
-- mirroring the existing book_class / admin_grant_makeup conventions.
--
-- Shared contract:
--   create_enrollment_request(name,surname,email,whatsapp,message,class_ids[]) -> uuid
--     anon-callable; validates >= 1 class; inserts request + request_classes.
--   redeem_invite(token) -> jsonb
--     anon-callable; returns { status, name, surname, email, whatsapp,
--     classes:[{id,date,start_time,end_time}] } for the invite page.
--   accept_enrollment_request(request_id, granted_class_ids[]) -> text
--     admin only; marks request accepted, sets granted flags, creates invite +
--     invite_classes, returns the invite token. COMP-ONLY (no payment_mode).
--   enroll_from_invite(token) -> void
--     authenticated; uses auth.uid() as profile; books confirmed comp bookings
--     for each invite_classes row, bypassing capacity/credit; idempotent.

-- =========================================================================
-- create_enrollment_request: public (anon) class-enrollment request
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_enrollment_request(
  p_name text,
  p_surname text,
  p_email text,
  p_whatsapp text,
  p_message text,
  p_class_ids uuid[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id uuid;
  v_class_id uuid;
  v_valid_count int;
BEGIN
  -- Basic field validation (abuse brake, spec R2).
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'NAME_REQUIRED' USING errcode = '22023';
  END IF;
  IF p_surname IS NULL OR length(trim(p_surname)) = 0 THEN
    RAISE EXCEPTION 'SURNAME_REQUIRED' USING errcode = '22023';
  END IF;
  IF p_email IS NULL OR p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'INVALID_EMAIL' USING errcode = '22023';
  END IF;

  -- Require at least one requested class (spec §8.3: v1 demands >= 1 class).
  IF p_class_ids IS NULL OR array_length(p_class_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'CLASSES_REQUIRED' USING errcode = '22023';
  END IF;

  -- Cap the number of requested classes as an abuse brake.
  IF array_length(p_class_ids, 1) > 20 THEN
    RAISE EXCEPTION 'TOO_MANY_CLASSES' USING errcode = '22023';
  END IF;

  -- All referenced classes must exist and be scheduled.
  SELECT count(DISTINCT id) INTO v_valid_count
    FROM public.classes
    WHERE id = ANY(p_class_ids)
      AND status = 'scheduled';
  IF v_valid_count = 0 THEN
    RAISE EXCEPTION 'NO_VALID_CLASSES' USING errcode = '22023';
  END IF;

  INSERT INTO public.enrollment_requests (name, surname, email, whatsapp, message, status)
    VALUES (trim(p_name), trim(p_surname), lower(trim(p_email)),
            nullif(trim(coalesce(p_whatsapp, '')), ''),
            nullif(trim(coalesce(p_message, '')), ''),
            'pending')
    RETURNING id INTO v_request_id;

  -- Link the (valid, distinct) requested classes.
  INSERT INTO public.enrollment_request_classes (request_id, class_id)
  SELECT v_request_id, c.id
    FROM public.classes c
    WHERE c.id = ANY(p_class_ids)
      AND c.status = 'scheduled'
  ON CONFLICT (request_id, class_id) DO NOTHING;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_enrollment_request(text, text, text, text, text, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.create_enrollment_request(text, text, text, text, text, uuid[]) TO anon, authenticated;

-- =========================================================================
-- redeem_invite: token lookup for the invite (/unirse) page
-- =========================================================================
CREATE OR REPLACE FUNCTION public.redeem_invite(
  p_token text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_effective_status text;
  v_classes jsonb;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'TOKEN_REQUIRED' USING errcode = '22023';
  END IF;

  SELECT id, token, name, surname, email, whatsapp, status, expires_at
    INTO v_invite
    FROM public.invites
    WHERE token = p_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND' USING errcode = 'P0002';
  END IF;

  -- Surface an 'expired' status for pending-but-past-expiry invites without
  -- needing a write here.
  v_effective_status := v_invite.status;
  IF v_invite.status = 'pending' AND v_invite.expires_at < now() THEN
    v_effective_status := 'expired';
  END IF;

  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', c.id,
               'date', c.date,
               'start_time', c.start_time,
               'end_time', c.end_time
             )
             ORDER BY c.date, c.start_time
           ),
           '[]'::jsonb
         )
    INTO v_classes
    FROM public.invite_classes ic
    JOIN public.classes c ON c.id = ic.class_id
    WHERE ic.invite_id = v_invite.id;

  RETURN jsonb_build_object(
    'status', v_effective_status,
    'name', v_invite.name,
    'surname', v_invite.surname,
    'email', v_invite.email,
    'whatsapp', v_invite.whatsapp,
    'classes', v_classes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_invite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO anon, authenticated;

-- =========================================================================
-- accept_enrollment_request: admin accepts a request, mints an invite
-- =========================================================================
CREATE OR REPLACE FUNCTION public.accept_enrollment_request(
  p_request_id uuid,
  p_granted_class_ids uuid[]
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_request record;
  v_token text;
  v_invite_id uuid;
  v_granted_count int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_ADMIN' USING errcode = '42501';
  END IF;

  IF p_granted_class_ids IS NULL OR array_length(p_granted_class_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'CLASSES_REQUIRED' USING errcode = '22023';
  END IF;

  SELECT id, name, surname, email, whatsapp, status
    INTO v_request
    FROM public.enrollment_requests
    WHERE id = p_request_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING errcode = 'P0002';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'REQUEST_NOT_PENDING' USING errcode = '22023';
  END IF;

  -- Granted classes must belong to this request (granted is a subset of requested).
  SELECT count(*) INTO v_granted_count
    FROM public.enrollment_request_classes erc
    WHERE erc.request_id = p_request_id
      AND erc.class_id = ANY(p_granted_class_ids);
  IF v_granted_count = 0 THEN
    RAISE EXCEPTION 'NO_VALID_GRANTED_CLASSES' USING errcode = '22023';
  END IF;

  -- Mark the request accepted.
  UPDATE public.enrollment_requests
     SET status = 'accepted',
         reviewed_at = now(),
         reviewed_by = v_admin
   WHERE id = p_request_id;

  -- Flag the granted request classes.
  UPDATE public.enrollment_request_classes
     SET granted = true
   WHERE request_id = p_request_id
     AND class_id = ANY(p_granted_class_ids);

  -- Generate a URL-safe random token (base64url of 24 random bytes).
  v_token := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');

  INSERT INTO public.invites (
    token, name, surname, email, whatsapp, request_id, status, created_by
  ) VALUES (
    v_token, v_request.name, v_request.surname, v_request.email,
    v_request.whatsapp, p_request_id, 'pending', v_admin
  ) RETURNING id INTO v_invite_id;

  -- Attach the granted classes to the invite (only those actually on the request).
  INSERT INTO public.invite_classes (invite_id, class_id)
  SELECT v_invite_id, erc.class_id
    FROM public.enrollment_request_classes erc
    WHERE erc.request_id = p_request_id
      AND erc.class_id = ANY(p_granted_class_ids)
  ON CONFLICT (invite_id, class_id) DO NOTHING;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_enrollment_request(uuid, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_enrollment_request(uuid, uuid[]) TO authenticated;

-- =========================================================================
-- enroll_from_invite: invitee redeems token -> comp bookings (idempotent)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.enroll_from_invite(
  p_token text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := auth.uid();
  v_invite record;
  v_class record;
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode = '28000';
  END IF;
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'TOKEN_REQUIRED' USING errcode = '22023';
  END IF;

  SELECT id, status, expires_at, profile_id
    INTO v_invite
    FROM public.invites
    WHERE token = p_token
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND' USING errcode = 'P0002';
  END IF;

  -- Idempotency: if already accepted by this same profile, nothing to do.
  IF v_invite.status = 'accepted' AND v_invite.profile_id = v_profile THEN
    RETURN;
  END IF;

  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'INVITE_NOT_PENDING' USING errcode = '22023';
  END IF;
  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'INVITE_EXPIRED' USING errcode = '22023';
  END IF;

  -- Book each invite class as a confirmed comp booking. Admin pre-approved,
  -- so we bypass capacity and credit checks. Idempotent per (student, class)
  -- via the bookings unique constraint: skip if an active booking exists, and
  -- ON CONFLICT DO NOTHING guards the cancelled-row edge.
  FOR v_class IN
    SELECT ic.class_id
      FROM public.invite_classes ic
      WHERE ic.invite_id = v_invite.id
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.bookings
        WHERE student_id = v_profile
          AND class_id = v_class.class_id
          AND status IN ('reserved','confirmed','attended')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.bookings (student_id, class_id, source, status)
      VALUES (v_profile, v_class.class_id, 'comp', 'confirmed')
    ON CONFLICT (student_id, class_id) DO NOTHING;
  END LOOP;

  -- Mark the invite accepted and bind it to the profile.
  UPDATE public.invites
     SET status = 'accepted',
         accepted_at = now(),
         profile_id = v_profile
   WHERE id = v_invite.id;
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_from_invite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.enroll_from_invite(text) TO authenticated;


-- ===== 20260619100900_classes_anon_select.sql =====
-- Block C: allow anonymous (logged-out) visitors to read SCHEDULED classes only,
-- so the public enrollment-request form (/solicitar) can show the class picker.
-- Read-only, scheduled classes only (date/time/capacity) — no bookings/PII exposed
-- (bookings RLS stays student-owned, so anon cannot read attendance/booked counts).

DROP POLICY IF EXISTS "classes_select_scheduled_anon" ON public.classes;
CREATE POLICY "classes_select_scheduled_anon"
  ON public.classes
  FOR SELECT
  TO anon
  USING (status = 'scheduled');


-- ===== 20260619100300_stripe_plans_reconcile.sql =====
-- Block A · A3.2 — Stripe plans lookup-key reconcile
--
-- The create-checkout Edge Function reads plans.stripe_price_id straight from
-- the DB and passes it to Stripe as a `lookup_key`
-- (stripe.prices.list({ lookup_keys: [priceId] })). So the value stored here
-- IS the Stripe lookup key that must exist on a real Price in the Stripe
-- dashboard.
--
-- Shared contract #3 / spec A3.1 fix the expected keys as:
--   plan_1_class_month, plan_2_class_month, plan_3_class_month, plan_4_class_month
-- (all singular "class"). An earlier reconcile migration accidentally stored
-- the 2/3/4-class tiers with a plural "classes" segment
-- (plan_2_classes_month, ...), which would never match the Stripe lookup key
-- the owner creates per the runbook. This migration normalises the active plan
-- rows to the contract values.
--
-- PRICES: amounts (price_cents) are intentionally LEFT AS-IS. The current
-- values (3500 / 6500 / 9000 / 11000 = 35 / 65 / 90 / 110 EUR) are placeholders
-- still to be CONFIRMED WITH THE OWNER (Cande) — see spec §6 Q1. The real
-- amounts live on the Stripe Price objects anyway; this table's price_cents is
-- display/seed only. The drop-in lookup key ('drop_in_class_single') is
-- hardcoded in create-checkout and is not stored here.
--
-- We do NOT invent real Stripe `price_…` IDs here: lookup keys are stable,
-- human-readable handles and are the correct contract surface.

-- Normalise the active plan tier rows to the canonical singular lookup keys.
UPDATE public.plans
   SET stripe_price_id = 'plan_' || classes_per_month || '_class_month'
 WHERE active = true
   AND classes_per_month BETWEEN 1 AND 4
   AND stripe_price_id IS DISTINCT FROM ('plan_' || classes_per_month || '_class_month');


-- ===== 20260621090000_update_plan_prices.sql =====
-- Update monthly plan prices (display values in plans.price_cents).
-- Plan 1 clase/mes stays 35 €. New: 2->50 €, 3->65 €, 4->80 €.
-- NOTE: this only changes the DISPLAYED price. The amount actually charged comes
-- from the Stripe Price behind each plan's lookup key (plan_N_class_month). The
-- matching Stripe Prices MUST be updated in the Stripe dashboard to 50/65/80 €
-- so the charge matches the display.

UPDATE public.plans SET price_cents = 5000 WHERE classes_per_month = 2;
UPDATE public.plans SET price_cents = 6500 WHERE classes_per_month = 3;
UPDATE public.plans SET price_cents = 8000 WHERE classes_per_month = 4;


-- ===== 20260621090100_cash_payment_plan_purchase.sql =====
-- Cash payment support for plan purchases (Efectivo).
-- (a) Adds payments.method text (nullable; values: 'card' | 'bizum' | 'cash'). No CHECK
--     constraint so existing inserts that omit method keep working.
-- (b) Adds purchase_plan_cash(p_plan_id uuid): activates the current-month subscription
--     immediately (granting credits, modelled exactly on grant_plan_subscription) and
--     records a pending cash payment. SECURITY DEFINER, uses auth.uid().

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS method text;

CREATE OR REPLACE FUNCTION public.purchase_plan_cash(p_plan_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_plan record;
  v_month date := date_trunc('month', (now() AT TIME ZONE 'Europe/Madrid'))::date;
  v_sub_id uuid;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, classes_per_month, price_cents, active INTO v_plan
    FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND OR v_plan.active IS NOT TRUE THEN
    RAISE EXCEPTION 'Plan not found or inactive';
  END IF;

  -- Guard: do not create a duplicate pending cash payment for the same plan/month.
  IF EXISTS (
    SELECT 1
      FROM public.payments p
      JOIN public.subscriptions s ON s.id = p.subscription_id
     WHERE p.student_id = v_student_id
       AND p.status = 'pending'
       AND p.method = 'cash'
       AND s.plan_id = v_plan.id
       AND s.month = v_month
  ) THEN
    RETURN;
  END IF;

  -- Credit/subscription logic modelled exactly on grant_plan_subscription.
  INSERT INTO public.subscriptions (student_id, plan_id, month, credits_total, credits_remaining)
  VALUES (v_student_id, v_plan.id, v_month, v_plan.classes_per_month, v_plan.classes_per_month)
  ON CONFLICT (student_id, month) DO UPDATE
    SET plan_id = EXCLUDED.plan_id,
        credits_total = public.subscriptions.credits_total + EXCLUDED.credits_total,
        credits_remaining = public.subscriptions.credits_remaining + EXCLUDED.credits_remaining
  RETURNING id INTO v_sub_id;

  INSERT INTO public.payments (student_id, subscription_id, amount_cents, status, method)
  VALUES (v_student_id, v_sub_id, v_plan.price_cents, 'pending', 'cash');

  PERFORM public.enqueue_notification(
    v_student_id,
    'plan_purchased',
    jsonb_build_object('plan_id', v_plan.id, 'subscription_id', v_sub_id, 'method', 'cash'),
    v_sub_id::text
  );
END;$$;

GRANT EXECUTE ON FUNCTION public.purchase_plan_cash(uuid) TO authenticated;


-- ===== 20260619100100_scheduler_extensions.sql =====
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


-- ===== 20260619100200_scheduler_cron_jobs.sql =====
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
