-- Backfill migration: captures objects that were created directly via the SQL
-- editor and were never committed as a migration, found during a full
-- migrations-vs-live-schema audit (2026-08-28). Definitions below were
-- reconstructed from live introspection (pg_get_functiondef,
-- information_schema, pg_constraint) so the repo becomes the full source of
-- truth again. Everything is IF NOT EXISTS / OR REPLACE, so it's a no-op if
-- the objects are already there.

-- Staff/role helpers, referenced by RLS policies below and elsewhere.
CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','instructora')
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_classes()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.is_staff(); $function$;

REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_manage_classes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_classes() TO anon, authenticated, service_role;

-- Free-form tags admins/instructoras can attach to a student profile.
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tags_name_key UNIQUE (name)
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tags_admin_all" ON public.tags;
CREATE POLICY "tags_admin_all" ON public.tags
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "tags_select_staff" ON public.tags;
CREATE POLICY "tags_select_staff" ON public.tags
  FOR SELECT USING (public.is_staff());

-- Many-to-many: which tags are attached to which profile.
CREATE TABLE IF NOT EXISTS public.profile_tags (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, tag_id)
);

ALTER TABLE public.profile_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profile_tags_admin_all" ON public.profile_tags;
CREATE POLICY "profile_tags_admin_all" ON public.profile_tags
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "profile_tags_select_staff" ON public.profile_tags;
CREATE POLICY "profile_tags_select_staff" ON public.profile_tags
  FOR SELECT USING (public.is_staff());

-- A student's standing weekly slot (independent of any one month's classes).
CREATE TABLE IF NOT EXISTS public.recurring_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  start_time time NOT NULL,
  active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recurring_slots_student_idx ON public.recurring_slots (student_id);

ALTER TABLE public.recurring_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recurring_slots_admin_all" ON public.recurring_slots;
CREATE POLICY "recurring_slots_admin_all" ON public.recurring_slots
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "recurring_slots_select_own_or_staff" ON public.recurring_slots;
CREATE POLICY "recurring_slots_select_own_or_staff" ON public.recurring_slots
  FOR SELECT USING (student_id = auth.uid() OR public.is_staff());
