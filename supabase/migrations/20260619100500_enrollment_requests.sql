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
