-- =============================================================================
-- Plan B · Phase 1 — DB-Migrationen  (manuell in den Lovable-Cloud SQL-Editor einfügen)
-- Quelle: docs/superpowers/plans/2026-06-21-roles-tags-member-db.md  (Phase 1)
-- Idempotent & re-runnable. Reihenfolge der Blöcke einhalten.
-- NACH dem Ausführen: in Lovable die types.ts neu generieren lassen, dann erst Frontend.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Rollen: admin | instructora | user   (legacy 'student' -> 'user')
--    WICHTIG: erst den CHECK droppen, DANN updaten — sonst verletzt 'user' den alten CHECK.
-- -----------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'user' where role = 'student';
alter table public.profiles alter column role set default 'user';
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin','instructora','user'));

-- -----------------------------------------------------------------------------
-- 2) Staff-Helper + Policy-/RPC-Switch
--    Instructora (= staff) darf Klassen/Buchungen/Warteliste managen + alle Profile LESEN.
--    Finanzen/Onboarding (subscriptions, payments, plans, makeups, enrollment_*, invites_*,
--    ledger, admin_actions) bleiben bewusst auf is_admin().
-- -----------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','instructora')
  );
$$;

create or replace function public.can_manage_classes()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_staff(); $$;

-- classes: staff sehen alle Status + managen alles
drop policy if exists "classes_select_scheduled" on public.classes;
create policy "classes_select_scheduled" on public.classes
  for select to authenticated using (status = 'scheduled' or public.is_staff());
drop policy if exists "classes_admin_all" on public.classes;
drop policy if exists "classes_staff_all" on public.classes;
create policy "classes_staff_all" on public.classes
  for all using (public.can_manage_classes()) with check (public.can_manage_classes());

-- bookings: staff managen (Buchungen verschieben/anlegen)
drop policy if exists "bookings_admin_all" on public.bookings;
drop policy if exists "bookings_staff_all" on public.bookings;
create policy "bookings_staff_all" on public.bookings
  for all using (public.is_staff()) with check (public.is_staff());

-- waitlist: staff managen
drop policy if exists "waitlist_admin_all" on public.waitlist;
drop policy if exists "waitlist_staff_all" on public.waitlist;
create policy "waitlist_staff_all" on public.waitlist
  for all using (public.is_staff()) with check (public.is_staff());

-- profiles: staff dürfen ALLE Profile lesen (Roster + Composer-Empfänger).
-- Schreiben/Rollen/Updates bleiben über profiles_admin_all (is_admin) gesperrt.
drop policy if exists "profiles_select_staff" on public.profiles;
create policy "profiles_select_staff" on public.profiles
  for select using (public.is_staff());

-- RPCs: identische Bodies, nur das Gate von is_admin() -> is_staff().
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
  IF NOT public.is_staff() THEN
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

CREATE OR REPLACE FUNCTION public.admin_move_booking(
  p_booking_id uuid,
  p_target_class_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_booking record;
  v_target record;
  v_count int;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'NOT_ADMIN' USING errcode = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING errcode = '22023';
  END IF;

  SELECT id, student_id, class_id, status, source INTO v_booking
    FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF v_booking.status NOT IN ('reserved','confirmed','attended') THEN
    RAISE EXCEPTION 'BOOKING_NOT_ACTIVE';
  END IF;

  SELECT id, status, capacity_max INTO v_target
    FROM public.classes WHERE id = p_target_class_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_CLASS_NOT_FOUND'; END IF;
  IF v_target.status <> 'scheduled' THEN RAISE EXCEPTION 'TARGET_NOT_SCHEDULED'; END IF;

  SELECT count(*) INTO v_count FROM public.bookings
    WHERE class_id = p_target_class_id AND status IN ('reserved','confirmed','attended');
  IF v_count >= v_target.capacity_max THEN RAISE EXCEPTION 'TARGET_FULL'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings
     WHERE class_id = p_target_class_id AND student_id = v_booking.student_id
       AND status IN ('reserved','confirmed','attended')
  ) THEN RAISE EXCEPTION 'ALREADY_BOOKED_TARGET'; END IF;

  UPDATE public.bookings SET class_id = p_target_class_id WHERE id = p_booking_id;

  INSERT INTO public.admin_actions (admin_id, student_id, action_type, reason, metadata)
  VALUES (v_admin, v_booking.student_id, 'move_booking', p_reason,
    jsonb_build_object('booking_id', p_booking_id,
                       'from_class_id', v_booking.class_id,
                       'to_class_id', p_target_class_id));

  PERFORM public.promote_waitlist(v_booking.class_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_grant_makeup(
  p_student_id uuid,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_synthetic_booking uuid;
  v_makeup_id uuid;
  v_expires timestamptz;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'NOT_ADMIN' USING errcode = '42501'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING errcode = '22023';
  END IF;

  v_expires := ((date_trunc('month', (now() AT TIME ZONE 'Europe/Madrid')::date)
                 + interval '1 month' - interval '1 day')::date::text
                || ' 23:59:00')::timestamp AT TIME ZONE 'Europe/Madrid';

  SELECT id INTO v_synthetic_booking FROM public.bookings
    WHERE student_id = p_student_id ORDER BY created_at DESC LIMIT 1;
  IF v_synthetic_booking IS NULL THEN
    RAISE EXCEPTION 'NO_BOOKING_HISTORY';
  END IF;

  INSERT INTO public.makeups (student_id, source_booking_id, expires_at)
    VALUES (p_student_id, v_synthetic_booking, v_expires)
    RETURNING id INTO v_makeup_id;

  INSERT INTO public.admin_actions (admin_id, student_id, action_type, reason, metadata)
  VALUES (v_admin, p_student_id, 'grant_makeup', p_reason,
    jsonb_build_object('makeup_id', v_makeup_id, 'expires_at', v_expires));

  RETURN v_makeup_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) Tags  (Seed: Horno, Privado, CoWorker) — staff lesen, admin schreibt/zuweist
-- -----------------------------------------------------------------------------
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  created_at timestamptz not null default now()
);
create table if not exists public.profile_tags (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, tag_id)
);

alter table public.tags enable row level security;
alter table public.profile_tags enable row level security;

drop policy if exists "tags_select_staff" on public.tags;
create policy "tags_select_staff" on public.tags for select using (public.is_staff());
drop policy if exists "tags_admin_all" on public.tags;
create policy "tags_admin_all" on public.tags for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "profile_tags_select_staff" on public.profile_tags;
create policy "profile_tags_select_staff" on public.profile_tags for select using (public.is_staff());
drop policy if exists "profile_tags_admin_all" on public.profile_tags;
create policy "profile_tags_admin_all" on public.profile_tags for all using (public.is_admin()) with check (public.is_admin());

insert into public.tags (name, color) values
  ('Horno', '#b45309'),
  ('Privado', '#7c3aed'),
  ('CoWorker', '#0ea5e9')
on conflict (name) do nothing;

-- -----------------------------------------------------------------------------
-- 4) Aktivität: membership_status + is_regular  &  recurring_slots (Stammplatz)
--    weekday 0=Mo … 6=So (passt zu lib/calendar.ts mondayIndex)
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists membership_status text not null default 'active',
  add column if not exists is_regular boolean not null default false;

alter table public.profiles drop constraint if exists profiles_membership_status_check;
alter table public.profiles
  add constraint profiles_membership_status_check
  check (membership_status in ('active','paused','inactive'));

create table if not exists public.recurring_slots (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists recurring_slots_student_idx on public.recurring_slots(student_id);

alter table public.recurring_slots enable row level security;
drop policy if exists "recurring_slots_select_own_or_staff" on public.recurring_slots;
create policy "recurring_slots_select_own_or_staff" on public.recurring_slots
  for select using (student_id = auth.uid() or public.is_staff());
drop policy if exists "recurring_slots_admin_all" on public.recurring_slots;
create policy "recurring_slots_admin_all" on public.recurring_slots
  for all using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 5) classes.instructor_id  (Freitext `instructor` aus dem Seed bleibt als Fallback)
-- -----------------------------------------------------------------------------
alter table public.classes
  add column if not exists instructor_id uuid references public.profiles(id) on delete set null;
create index if not exists classes_instructor_id_idx on public.classes(instructor_id);

-- -----------------------------------------------------------------------------
-- 6) Admin-Seeding  (greift nur, wenn die Profile existieren = Accounts haben sich
--    mind. 1x registriert; sonst nach Registrierung erneut ausführen)
-- -----------------------------------------------------------------------------
update public.profiles
  set role = 'admin'
  where lower(email) in ('zuzacande@gmail.com','mail.tobiasjung@gmail.com');

-- =============================================================================
-- VERIFIKATION (optional, nach dem Ausführen einzeln laufen lassen):
--   select role, count(*) from public.profiles group by role;
--   select name, color from public.tags order by name;
--   select proname from pg_proc where proname in ('is_staff','can_manage_classes');
--   select column_name from information_schema.columns
--     where table_name='profiles' and column_name in ('membership_status','is_regular');
--   select column_name from information_schema.columns
--     where table_name='classes' and column_name='instructor_id';
--   select email, role from public.profiles
--     where lower(email) in ('zuzacande@gmail.com','mail.tobiasjung@gmail.com');
-- =============================================================================
