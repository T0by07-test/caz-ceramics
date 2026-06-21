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
