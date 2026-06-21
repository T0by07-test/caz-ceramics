# Roles, Tags, Activity & Member DB — Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a third role `instructora` (Klassen-Managerin), staff RLS helpers, a normalized tag system (Horno/Privado/CoWorker), activity status + recurring fixed slots, a full **Miembros** admin DB over all users, and three integrations (tag→composer, instructor↔class, roster tags/slot).

**Architecture:** DB-first. Phase 1 = idempotent SQL migrations (roles, `is_staff()`/`can_manage_classes()`, tags, activity/slots, `classes.instructor_id`, admin seed). Then a **Lovable Cloud checkpoint** (apply migrations + regenerate `types.ts`). Phases 2–4 = frontend (role plumbing, Miembros DB, integrations). RLS is the real authorization backstop; frontend gating is UX only.

**Tech Stack:** Supabase/Postgres (RLS, RPCs, PostgREST nested selects), TanStack Start/Router, React 19, shadcn/ui. Spec: [2026-06-21-rollen-tags-kalender-design.md](../specs/2026-06-21-rollen-tags-kalender-design.md) §5.

**Verification model:** No test runner (deliberate). Verify with `npx tsc --noEmit`, `npm run lint`, and the Lovable preview. **DB caveat:** migrations are authored as files here but **applied in Lovable Cloud** (this project uses Lovable-managed Supabase, no local DB). So Phase-1 tasks end at "migration file written + SQL self-checked"; actual application + RLS testing happen at the checkpoint. Frontend phases can only typecheck after `types.ts` is regenerated post-migration.

> **Git:** commit directly to `main` (project convention). If a parallel session shares the working tree, use a worktree. **Branch-guard every commit** (`git branch --show-current` == `main`); stage only named files (never `git add -A`).

> **Role vs hook-mode gotcha:** `useClassesInRange(range, "student")` — the `"student"` there is a *query mode* (student-view vs admin-view), **NOT** the `profiles.role` value. The role rename `student→user` must NOT touch those hook-mode args.

---

## File Structure

**Create — migrations** (`supabase/migrations/`, naming `20260621HHMMSS_<name>.sql`, all idempotent):
- `..._role_user_and_instructora.sql` — role CHECK → `admin|instructora|user`, `student→user`.
- `..._staff_rls.sql` — `is_staff()`, `can_manage_classes()`; switch class-mgmt policies/RPCs; `profiles_select_staff`.
- `..._tags.sql` — `tags`, `profile_tags` + RLS + seed.
- `..._membership_and_slots.sql` — `profiles.membership_status`, `is_regular`; `recurring_slots` + RLS.
- `..._classes_instructor_id.sql` — `classes.instructor_id` FK.
- `..._seed_admins.sql` — promote the two admin emails.

**Create — frontend:**
- `src/lib/members.ts` — types + helpers: `Estado`, `deriveEstado`, `formatSlot`, role labels.
- `src/components/admin/TagPicker.tsx` — multi-select tag assignment (Popover+Command+Checkbox).
- `src/components/admin/SlotEditor.tsx` — add/remove recurring slots for a member.

**Modify — frontend:**
- `src/lib/auth.tsx` — `Role` adds `instructora`, drops `student`→`user`; `isStaff` helper.
- `src/components/RouteGuard.tsx` — accept `Role | Role[]`; `requireStaff`/`requireAdmin`; redirects.
- `src/routes/admin.tsx` — staff guard + role-filtered nav + "Miembros" label.
- `src/routes/admin.alumnas.tsx` — Miembros DB: all roles, tags, estado, slot, filters; detail-sheet edits.
- `src/routes/admin.mensajes.tsx` — accept tag-filtered recipients via URL param.
- `src/routes/admin.clases.tsx` — instructor select in form; `instructor_id` save; "Mis clases" filter; roster tag/slot display.
- `src/routes/app.index.tsx`, `src/routes/app.reservas.tsx`, `src/routes/app.recuperaciones.tsx`, `src/routes/app.perfil.tsx`, `src/routes/app.planes.tsx`, `src/routes/app.pago-exitoso.tsx`, `src/routes/app.plan-exitoso.tsx`, `src/routes/login.tsx`, `src/routes/signup.tsx`, `src/routes/unirse.$token.tsx` — anywhere a literal `"student"` role is compared/used (NOT hook-mode args) → `"user"`. (Task 7 includes a grep to find them all.)

---

# PHASE 1 — Database migrations

> All Phase-1 tasks: write the migration file, eyeball-check the SQL, commit. No local DB to run against. Each commit message uses `feat(db): …`.

## Task 1: Role rename + `instructora`

**Files:** Create `supabase/migrations/20260621120000_role_user_and_instructora.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Roles: admin | instructora | user (rename legacy 'student' -> 'user').
-- The CHECK is the auto-named profiles_role_check (table_column_check).
alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles set role = 'user' where role = 'student';

alter table public.profiles alter column role set default 'user';

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin','instructora','user'));
```

- [ ] **Step 2: Self-check** — Read the file. Confirm: drop-if-exists before add (idempotent); UPDATE precedes the new CHECK (so existing 'student' rows pass); default changed. Note: `handle_new_user()` doesn't set role explicitly, so new signups inherit the `'user'` default — no trigger change needed.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/20260621120000_role_user_and_instructora.sql
git commit -m "feat(db): role model admin/instructora/user (rename student->user)"
```

## Task 2: Staff RLS helpers + policy/RPC switch

**Files:** Create `supabase/migrations/20260621120100_staff_rls.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Staff = admin OR instructora. Mirrors is_admin().
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

-- CLASSES: staff manage + see all statuses.
drop policy if exists "classes_select_scheduled" on public.classes;
create policy "classes_select_scheduled" on public.classes
  for select to authenticated using (status = 'scheduled' or public.is_staff());
drop policy if exists "classes_admin_all" on public.classes;
create policy "classes_staff_all" on public.classes
  for all using (public.can_manage_classes()) with check (public.can_manage_classes());

-- BOOKINGS: staff manage (move/cancel for class management).
drop policy if exists "bookings_admin_all" on public.bookings;
create policy "bookings_staff_all" on public.bookings
  for all using (public.is_staff()) with check (public.is_staff());

-- WAITLIST: staff manage.
drop policy if exists "waitlist_admin_all" on public.waitlist;
create policy "waitlist_staff_all" on public.waitlist
  for all using (public.is_staff()) with check (public.is_staff());

-- PROFILES: staff may READ all (rosters + composer recipients). Writes stay admin-only.
drop policy if exists "profiles_select_staff" on public.profiles;
create policy "profiles_select_staff" on public.profiles
  for select using (public.is_staff());

-- RPCs used for class management: gate on staff instead of admin.
-- (Re-create with identical bodies except the gate line. See note.)
```

> **Step 1 note (RPC bodies):** `mark_attendance`, `admin_move_booking`, `admin_grant_makeup` must be re-declared with `CREATE OR REPLACE FUNCTION` keeping their **exact existing bodies** but changing the first gate from `IF NOT public.is_admin()` to `IF NOT public.is_staff()`. Copy each function verbatim from its source migration (`20260619100400_mark_attendance_rpc.sql`, `20260423144402_*.sql`) and change only that one line. Append all three to this migration file.

- [ ] **Step 2: Self-check** — Confirm only class/booking/waitlist/roster objects moved to staff; `subscriptions`, `payments`, `plans`, `makeups_admin_all`, `notifications`, `enrollment_*`, `invites_*`, `ledger_*`, `admin_actions`, `accept_enrollment_request` remain on `is_admin()`. Confirm `profiles_select_own`/`profiles_update_own`/`profiles_admin_all` are untouched (the new `profiles_select_staff` is additive — Postgres ORs multiple permissive SELECT policies). Confirm each RPC kept its body and only the gate changed.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/20260621120100_staff_rls.sql
git commit -m "feat(db): is_staff()/can_manage_classes(); instructora can manage classes + read profiles"
```

## Task 3: Tags

**Files:** Create `supabase/migrations/20260621120200_tags.sql`

- [ ] **Step 1: Write the migration**

```sql
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

-- Read for staff; write (manage + assign) admin-only.
drop policy if exists "tags_select_staff" on public.tags;
create policy "tags_select_staff" on public.tags for select using (public.is_staff());
drop policy if exists "tags_admin_all" on public.tags;
create policy "tags_admin_all" on public.tags for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "profile_tags_select_staff" on public.profile_tags;
create policy "profile_tags_select_staff" on public.profile_tags for select using (public.is_staff());
drop policy if exists "profile_tags_admin_all" on public.profile_tags;
create policy "profile_tags_admin_all" on public.profile_tags for all using (public.is_admin()) with check (public.is_admin());

-- Seed the three known tags.
insert into public.tags (name, color) values
  ('Horno', '#b45309'),
  ('Privado', '#7c3aed'),
  ('CoWorker', '#0ea5e9')
on conflict (name) do nothing;
```

- [ ] **Step 2: Self-check** — `if not exists`/`on conflict do nothing` → re-runnable. RLS: staff read, admin write.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/20260621120200_tags.sql
git commit -m "feat(db): tags + profile_tags (seed Horno/Privado/CoWorker), staff-read/admin-write"
```

## Task 4: Membership status + recurring slots

**Files:** Create `supabase/migrations/20260621120300_membership_and_slots.sql`

- [ ] **Step 1: Write the migration**

```sql
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
  weekday smallint not null check (weekday between 0 and 6), -- 0=Mon … 6=Sun (matches lib/calendar.ts mondayIndex)
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
```

- [ ] **Step 2: Self-check** — `weekday` 0=Mon convention documented (matches `mondayIndex`); membership CHECK drop-then-add idempotent; RLS own-or-staff read, admin write.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/20260621120300_membership_and_slots.sql
git commit -m "feat(db): membership_status + is_regular + recurring_slots"
```

## Task 5: `classes.instructor_id`

**Files:** Create `supabase/migrations/20260621120400_classes_instructor_id.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Link a class to an instructora profile. Free-text `instructor` (from seed) stays as display fallback.
alter table public.classes
  add column if not exists instructor_id uuid references public.profiles(id) on delete set null;
create index if not exists classes_instructor_id_idx on public.classes(instructor_id);
```

- [ ] **Step 2: Self-check** — nullable FK, `on delete set null`, idempotent.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/20260621120400_classes_instructor_id.sql
git commit -m "feat(db): classes.instructor_id FK to profiles"
```

## Task 6: Seed admins

**Files:** Create `supabase/migrations/20260621120500_seed_admins.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Promote the two known owners. Re-runnable; no-op if their profiles don't exist yet
-- (profiles rows require an auth.users signup first).
update public.profiles
  set role = 'admin'
  where lower(email) in ('zuzacande@gmail.com','mail.tobiasjung@gmail.com');
```

- [ ] **Step 2: Self-check** — case-insensitive match; idempotent; documented precondition (accounts must have signed up).

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/20260621120500_seed_admins.sql
git commit -m "feat(db): seed admin role for owner accounts"
```

---

## ⛳ CHECKPOINT (human + Lovable Cloud) — between Phase 1 and Phase 2

This is a **hard handoff** the agent cannot do locally. After Phase 1 commits (and a push), in Lovable Cloud:
1. Apply the six migrations (Lovable picks them up from the repo / or paste via its SQL path).
2. **Regenerate `src/integrations/supabase/types.ts`** so it includes `tags`, `profile_tags`, `recurring_slots`, `profiles.membership_status`/`is_regular`, `classes.instructor_id`, the new role values, and `is_staff`/`can_manage_classes` RPCs.
3. Confirm the two owner emails exist as profiles (else re-run Task 6's migration after they sign up).
4. RLS smoke test with an `instructora` and a `user` session (see §Verification).

Phases 2–4 typecheck only after step 2. Do not start Phase 2 until the controller confirms the checkpoint is done.

---

# PHASE 2 — Role plumbing (frontend)

## Task 7: `auth.tsx` role model + `student→user` literal sweep

**Files:** Modify `src/lib/auth.tsx` + every route comparing the literal role `"student"`.

- [ ] **Step 1: Update the Role type + add `isStaff`**

In `src/lib/auth.tsx`, line 5:
```ts
export type Role = "admin" | "instructora" | "user";
```
In `fetchRole`, change the fallback default from `"student"` to `"user"`:
```ts
setRole(((data?.role as Role) ?? "user"));
```
Add an exported helper at the bottom of the file:
```ts
export function isStaff(role: Role | null): boolean {
  return role === "admin" || role === "instructora";
}
```

- [ ] **Step 2: Sweep role literals** — Run `grep -rn '"student"' src/` and `grep -rn "'student'" src/`. For EACH hit, determine: is it a `profiles.role` value (→ change to `"user"`) or a `useClassesInRange/useMonthClasses` **mode** arg (→ LEAVE unchanged)? The hook-mode `"student"` appears in `app.index.tsx`, `admin.clases.tsx`, `app.recuperaciones.tsx` calls — leave those. Role-value comparisons (e.g. RouteGuard `requireRole="student"`, any `role === "student"`, `.eq("role","student")` queries) → `"user"`. Apply.

- [ ] **Step 3: Typecheck**
Run: `npx tsc --noEmit`
Expected: clean (after `types.ts` regen at checkpoint). Note any consumer still expecting `"student"`.

- [ ] **Step 4: Commit** (stage `auth.tsx` plus each file the grep sweep changed — list them explicitly, no `git add -A`)
```bash
git add src/lib/auth.tsx src/components/RouteGuard.tsx <other-swept-files>
git commit -m "feat(roles): Role = admin|instructora|user; sweep student->user literals"
```

## Task 8: `RouteGuard` — role lists + staff/admin guards

**Files:** Modify `src/components/RouteGuard.tsx`

- [ ] **Step 1: Generalize the guard**

```tsx
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, isStaff, type Role } from "@/lib/auth";

type Props = {
  children: React.ReactNode;
  requireRole?: Role | Role[];
  requireStaff?: boolean;  // admin OR instructora
  requireAdmin?: boolean;  // admin only
};

export function RouteGuard({ children, requireRole, requireStaff, requireAdmin }: Props) {
  const { session, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    const home = isStaff(role) ? "/admin" : "/app";
    const allowed =
      requireAdmin ? role === "admin"
      : requireStaff ? isStaff(role)
      : requireRole
        ? (Array.isArray(requireRole) ? requireRole.includes(role as Role) : role === requireRole)
        : true;
    if (!allowed) navigate({ to: home });
  }, [session, role, loading, requireRole, requireStaff, requireAdmin, navigate]);

  if (loading || !session) return null; // keep existing loading/return behavior
  return <>{children}</>;
}
```
> Preserve whatever the current file returns while `loading`/no-session (match the existing render — the snippet above assumes it returns `null`; if it renders a spinner, keep that).

- [ ] **Step 2: Typecheck** `npx tsc --noEmit` → clean.
- [ ] **Step 3: Commit**
```bash
git add src/components/RouteGuard.tsx
git commit -m "feat(roles): RouteGuard supports role lists + requireStaff/requireAdmin"
```

## Task 9: Admin shell — staff access, role-filtered nav, "Miembros"

**Files:** Modify `src/routes/admin.tsx`; add per-page `requireAdmin` guards to finance/onboarding routes.

- [ ] **Step 1: Admin shell allows staff; nav filtered by role**

In `src/routes/admin.tsx`, make `AdminLayout` role-aware:
```tsx
import { useAuth } from "@/lib/auth";
// ...
function AdminLayout() {
  const { role } = useAuth();
  const adminOnly = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { to: "/admin/solicitudes", label: "Solicitudes", icon: Inbox },
    { to: "/admin/pagos", label: "Pagos", icon: Wallet },
    { to: "/admin/registro", label: "Registro", icon: NotebookPen },
    { to: "/admin/notificaciones", label: "Notificaciones", icon: Bell },
  ];
  const staffItems = [
    { to: "/admin/clases", label: "Clases", icon: CalendarDays },
    { to: "/admin/alumnas", label: "Miembros", icon: Users },
    { to: "/admin/mensajes", label: "Mensajes", icon: MessageCircle },
  ];
  const items =
    role === "admin"
      ? [adminOnly[0], adminOnly[1], staffItems[0], staffItems[1], staffItems[2], adminOnly[2], adminOnly[3], adminOnly[4]]
      : staffItems; // instructora: Clases, Miembros, Mensajes only
  return (
    <RouteGuard requireStaff>
      <AppShell brand="Cerámica Studio · Admin" items={items} />
    </RouteGuard>
  );
}
```
> Keep the original admin-ordered nav for admins (Dashboard, Solicitudes, Clases, Miembros, Mensajes, Pagos, Registro, Notificaciones). Instructora sees only Clases/Miembros/Mensajes and lands on `/admin/clases` (Dashboard is finance-heavy — see Step 2).

- [ ] **Step 2: Per-page admin guards (URL-hack backstop; RLS is the real gate)**
Wrap the page bodies of `admin.index.tsx` (Dashboard), `admin.solicitudes.tsx`, `admin.pagos.tsx`, `admin.registro.tsx`, `admin.notificaciones.tsx` with `<RouteGuard requireAdmin>`. (These already render inside the admin shell, so just swap their inner guard or add one.) An instructora hitting these URLs is redirected to `/admin` → which, lacking Dashboard access, should send her to `/admin/clases`: make `admin.index.tsx` redirect instructora to `/admin/clases` (or render `requireAdmin`, which redirects her home = `/admin`… so instead set instructora's default by having `admin.index` itself `requireAdmin` and, on redirect, RouteGuard sends staff to `/admin` — to avoid a loop, give `admin.index` an explicit instructora→`/admin/clases` redirect).
> Simplest robust approach: in `admin.index.tsx`, if `role === "instructora"` `navigate({to:"/admin/clases"})`; else render the dashboard. Mensajes/Clases/Miembros stay `requireStaff` (via the shell).

- [ ] **Step 3: Typecheck + lint** `npx tsc --noEmit && npm run lint` (no NEW lint errors).
- [ ] **Step 4: Commit**
```bash
git add src/routes/admin.tsx src/routes/admin.index.tsx src/routes/admin.solicitudes.tsx src/routes/admin.pagos.tsx src/routes/admin.registro.tsx src/routes/admin.notificaciones.tsx
git commit -m "feat(roles): staff-access admin shell, role-filtered nav, instructora landing"
```

---

# PHASE 3 — Tags, activity & Miembros DB

## Task 10: Member helpers (`src/lib/members.ts`)

**Files:** Create `src/lib/members.ts`

- [ ] **Step 1: Implement**

```ts
import { ES_WEEKDAYS_SHORT, formatTime } from "@/lib/calendar";
import type { Role } from "@/lib/auth";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  instructora: "Instructora",
  user: "Miembro",
};

export type MembershipStatus = "active" | "paused" | "inactive";
export type Estado = "activa" | "pausada" | "inactiva" | "sin_actividad";

export const ESTADO_LABELS: Record<Estado, string> = {
  activa: "Activa",
  pausada: "Pausada",
  inactiva: "Inactiva",
  sin_actividad: "Sin actividad este mes",
};

/** paused/inactive → direct; else activa if booked-this-month OR regular; else sin_actividad. */
export function deriveEstado(
  membership: MembershipStatus,
  bookedThisMonth: boolean,
  isRegular: boolean,
): Estado {
  if (membership === "paused") return "pausada";
  if (membership === "inactive") return "inactiva";
  if (bookedThisMonth || isRegular) return "activa";
  return "sin_actividad";
}

export type RecurringSlot = { id: string; weekday: number; start_time: string; active: boolean; note: string | null };

/** weekday 0=Mon..6=Sun + "HH:MM:SS" → "Lun 18:30". */
export function formatSlot(weekday: number, startTime: string): string {
  return `${ES_WEEKDAYS_SHORT[weekday] ?? "?"} ${formatTime(startTime)}`;
}
```

- [ ] **Step 2: Typecheck** `npx tsc --noEmit` → clean.
- [ ] **Step 3: Commit**
```bash
git add src/lib/members.ts
git commit -m "feat(members): role/estado labels + estado derivation + slot formatting"
```

## Task 11: `TagPicker` component

**Files:** Create `src/components/admin/TagPicker.tsx`

- [ ] **Step 1: Implement** a Popover+Command+Checkbox multi-select that lists all `tags`, shows current assignments as checked, and calls back on toggle. It owns no persistence — parent persists.

```tsx
import { useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export type Tag = { id: string; name: string; color: string | null };

type Props = {
  allTags: Tag[];
  selectedIds: string[];
  onToggle: (tagId: string, next: boolean) => void;
  disabled?: boolean;
};

export function TagPicker({ allTags, selectedIds, onToggle, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const selected = new Set(selectedIds);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {allTags.filter((t) => selected.has(t.id)).map((t) => (
          <Badge key={t.id} variant="outline">{t.name}</Badge>
        ))}
        {selectedIds.length === 0 ? <span className="text-sm text-muted-foreground">Sin tags</span> : null}
      </div>
      {disabled ? null : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">Editar tags</Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar tag…" />
              <CommandList>
                <CommandEmpty>Sin resultados.</CommandEmpty>
                <CommandGroup>
                  {allTags.map((t) => {
                    const on = selected.has(t.id);
                    return (
                      <CommandItem key={t.id} value={t.name} onSelect={() => onToggle(t.id, !on)}>
                        <Check className={["mr-2 h-4 w-4", on ? "opacity-100" : "opacity-0"].join(" ")} />
                        {t.name}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
```
> `disabled` is set true for instructora (read-only — RLS blocks writes anyway).

- [ ] **Step 2: Typecheck** `npx tsc --noEmit`. Confirm `command.tsx`/`popover.tsx`/`badge.tsx` exports match (they exist per the UI inventory).
- [ ] **Step 3: Commit**
```bash
git add src/components/admin/TagPicker.tsx
git commit -m "feat(members): TagPicker multi-select component"
```

## Task 12: `SlotEditor` component

**Files:** Create `src/components/admin/SlotEditor.tsx`

- [ ] **Step 1: Implement** an editor listing a member's `recurring_slots` with add (weekday `<select>` 0–6 + time input) and remove. Parent passes slots + persistence callbacks.

```tsx
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ES_WEEKDAYS_SHORT } from "@/lib/calendar";
import { formatSlot, type RecurringSlot } from "@/lib/members";

type Props = {
  slots: RecurringSlot[];
  onAdd: (weekday: number, startTime: string) => void;
  onRemove: (slotId: string) => void;
  disabled?: boolean;
};

export function SlotEditor({ slots, onAdd, onRemove, disabled }: Props) {
  const [weekday, setWeekday] = useState(0);
  const [time, setTime] = useState("18:30");
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {slots.length === 0 ? <li className="text-sm text-muted-foreground">Sin slot fijo</li> : null}
        {slots.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-sm">
            <span>{formatSlot(s.weekday, s.start_time)}</span>
            {disabled ? null : (
              <button type="button" aria-label="Quitar slot" onClick={() => onRemove(s.id)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {disabled ? null : (
        <div className="flex items-end gap-2">
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
          >
            {ES_WEEKDAYS_SHORT.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
          <input
            type="time"
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => onAdd(weekday, `${time}:00`)}>
            Añadir
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** `npx tsc --noEmit`.
- [ ] **Step 3: Commit**
```bash
git add src/components/admin/SlotEditor.tsx
git commit -m "feat(members): SlotEditor for recurring fixed slots"
```

## Task 13: Miembros DB — list (all roles, tags, estado, slot, filters)

**Files:** Modify `src/routes/admin.alumnas.tsx` (list + loader; detail-sheet edits are Task 13b below).

- [ ] **Step 1: Extend the row type + loader**

Extend `StudentRow` (current lines 52–61) with:
```ts
  role: "admin" | "instructora" | "user";
  membership_status: "active" | "paused" | "inactive";
  is_regular: boolean;
  tags: { id: string; name: string }[];
  slots: { id: string; weekday: number; start_time: string }[];
  estado: import("@/lib/members").Estado;
```
Replace the profiles loader (current lines ~94–98) — drop `.eq("role","student")`, select all roles + embeds:
```ts
const { data: profiles } = await supabase
  .from("profiles")
  .select("id, role, name, surname, email, whatsapp, membership_status, is_regular, profile_tags(tags(id,name)), recurring_slots(id,weekday,start_time)")
  .order("created_at", { ascending: false });
```
Add a current-month booking probe to compute estado — fetch active bookings joined to classes whose `date` is in the current month, collect `student_id`s. Use the true month bounds (NOT `monthGridRange`, which is the 6-week grid) via `startOfMonth`/`endOfMonth`/`toIsoDate` from `@/lib/calendar` (all exported); browser-local time is an acceptable proxy for Europe/Madrid, matching the codebase's existing client-side convention:
```ts
import { startOfMonth, endOfMonth, toIsoDate } from "@/lib/calendar";
// ...
const now = new Date();
const monthStartIso = toIsoDate(startOfMonth(now));
const monthEndIso = toIsoDate(endOfMonth(now));
const { data: monthBookings } = await supabase
  .from("bookings")
  .select("student_id, classes!inner(date)")
  .gte("classes.date", monthStartIso)
  .lte("classes.date", monthEndIso)
  .in("status", ["reserved", "confirmed", "attended"]);
const bookedThisMonth = new Set((monthBookings ?? []).map((b) => b.student_id));
```

Build each row mapping `profile_tags`→`tags`, `recurring_slots`→`slots`, and `estado = deriveEstado(membership_status, bookedThisMonth.has(id), is_regular)`.

- [ ] **Step 2: Columns + filters**

Header row (current lines ~195–202) → add **Rol**, **Tags**, **Estado**, **Slot** columns. Body renders: role via `ROLE_LABELS`, tags as `<Badge>` chips, estado via `ESTADO_LABELS` (color the badge by estado), slot via `formatSlot(s.weekday, s.start_time)` joined.
Add filter controls above the table: a **Rol** `<Select>` (Todos/Admin/Instructora/Miembro), a **Tag** `<Select>` (Todos + each tag), an **Estado** `<Select>` (Todos/Activa/Pausada/Inactiva/Sin actividad). Apply client-side over the loaded rows (keep the existing name/email search). Page title/heading → "Miembros".

- [ ] **Step 3: Typecheck + lint** `npx tsc --noEmit && npm run lint`.
- [ ] **Step 4: Commit**
```bash
git add src/routes/admin.alumnas.tsx
git commit -m "feat(members): Miembros DB lists all roles with tags, estado, slot + filters"
```

## Task 13b: Miembros detail sheet — edit tags, status, slots

**Files:** Modify `src/routes/admin.alumnas.tsx` (the `StudentDetailSheet`, current lines ~320–486).

- [ ] **Step 1: Add an "Actividad y tags" section** in the detail sheet, gated `disabled={role !== "admin"}` (instructora read-only). Wire:
  - **TagPicker**: `allTags` loaded once (query `tags`); `onToggle` → insert/delete `profile_tags` row (`supabase.from("profile_tags").insert({profile_id, tag_id})` / `.delete().match({profile_id, tag_id})`), then refresh.
  - **membership_status**: a `<Select>` (active/paused/inactive) → `supabase.from("profiles").update({ membership_status }).eq("id", id)`.
  - **is_regular**: a `<Switch>` → update `profiles.is_regular`.
  - **SlotEditor**: `onAdd` → insert `recurring_slots`; `onRemove` → delete by id; refresh.
  After any mutation, refresh the row + list (reuse the list's loader).

- [ ] **Step 2: Typecheck + lint**, then preview-verify at the checkpoint (admin session): open a member, assign a tag, set a slot, toggle status → row updates; estado reflects paused/regular.
- [ ] **Step 3: Commit**
```bash
git add src/routes/admin.alumnas.tsx
git commit -m "feat(members): detail-sheet editing of tags, membership status, recurring slots"
```

---

# PHASE 4 — Integrations

## Task 14: Instructor↔class + "Mis clases"

**Files:** Modify `src/routes/admin.clases.tsx`

- [ ] **Step 1: Instructor select in `ClassFormDialog`** — add `instructorId` state; load instructoras (`profiles` where `role='instructora'`) when the dialog opens; render a `<Select>` (with an "Sin instructora" empty option); include `instructor_id: instructorId || null` in both insert and update payloads. Prefill from `cls.instructor_id` in edit mode.
- [ ] **Step 2: "Mis clases" filter** — for an instructora viewing the admin calendar, add a toggle "Mis clases" that filters the rendered classes to `instructor_id === user.id`. (Filter client-side over the `classes` from `useClassesInRange`; the hook already returns the range. Add `instructor_id` to the hook's select in `useClassesInRange.ts` so it's available — small, additive change; update `ClassRow`.)
- [ ] **Step 3: Typecheck + lint.** Commit:
```bash
git add src/routes/admin.clases.tsx src/hooks/useClassesInRange.ts
git commit -m "feat(classes): assign instructora + 'Mis clases' filter"
```

## Task 15: Roster tags + slot in class drawer

**Files:** Modify `src/routes/admin.clases.tsx` (`AdminClassDrawer` roster).

- [ ] **Step 1:** Extend the roster `bookings` select (current ~lines 368–370) to embed tags + slots:
```ts
.select("id, status, source, profiles:student_id ( name, surname, email, profile_tags(tags(id,name)), recurring_slots(id,weekday,start_time) )")
```
Extend `BookedStudent.profiles` type with `profile_tags`/`recurring_slots`. In the roster row JSX, render tag `<Badge>` chips and the first slot via `formatSlot`. Keep the attendance toggle.
- [ ] **Step 2: Typecheck + lint.** Commit:
```bash
git add src/routes/admin.clases.tsx
git commit -m "feat(classes): show member tags + recurring slot in class roster"
```

## Task 16: Tag-filter → message composer

**Files:** Modify `src/routes/admin.mensajes.tsx` + add a "Enviar mensaje" action in the Miembros filter bar (`admin.alumnas.tsx`).

- [ ] **Step 1: Composer accepts a tag filter via URL** — add `validateSearch` to `admin.mensajes` route parsing `{ tag?: string }`. When present, load recipients: `profiles` joined through `profile_tags` for that tag (PostgREST: `from("profile_tags").select("profiles(id,name,email,whatsapp)").eq("tag_id", tagId)`), show a recipient count + chips, and (matching the existing copy-not-send workflow) expose the recipient list for copy. Instructora may use this page (it's in the staff nav).
- [ ] **Step 2: Miembros → composer hand-off** — in `admin.alumnas.tsx`, when a Tag filter is active, show a button "Enviar mensaje a este grupo" → `navigate({ to: "/admin/mensajes", search: { tag: tagId } })`.
- [ ] **Step 3: Typecheck + lint.** Commit:
```bash
git add src/routes/admin.mensajes.tsx src/routes/admin.alumnas.tsx
git commit -m "feat(messages): tag-filtered recipient hand-off from Miembros to composer"
```

---

## Verification

**RLS (at checkpoint, with three sessions):**
- `instructora`: CAN read all profiles, manage classes/bookings/waitlist, mark attendance, move bookings, grant makeup, use composer. CANNOT read/write `subscriptions`, `payments`, `ledger_entries`, `enrollment_*`, `invites`, update other profiles, or write tags/`recurring_slots` (writes admin-only).
- `user`: sees only own profile/bookings; cannot read others.
- `admin`: unchanged full access.
- Verify the role rename: existing `student` rows became `user`; new signup gets `user`; the two owner emails became `admin`.

**Frontend:**
- `tsc` + `lint` clean (no NEW lint findings beyond the ~1340 pre-existing prettier ones).
- Instructora login → admin shell shows only Clases/Miembros/Mensajes, lands on `/admin/clases`; `/admin/pagos` URL redirects away; tag/slot/status controls are read-only (disabled).
- Miembros DB: all roles listed; filter by Rol/Tag/Estado; estado correct for paused / regular / booked-this-month / none; tag assign + slot add + status change persist (admin).
- Class form assigns an instructora; "Mis clases" filters; roster shows tags + slot; Miembros tag-filter → composer carries the group.

**Self-review (run after writing all tasks):** spec §5 coverage (roles ✓ T1/7/8/9, RLS ✓ T2, tags ✓ T3/11/13, activity+slots ✓ T4/10/12/13b, Miembros DB ✓ T13/13b, additions ✓ T14/15/16); no placeholders; type names consistent (`Role`, `Estado`, `RecurringSlot`, `Tag` used the same everywhere); the `student→user` sweep (T7) must precede RLS-dependent UI; DB checkpoint precedes all frontend typechecks.

## Risks / notes
- **`types.ts` regeneration is mandatory** before Phase 2 typechecks — it's the checkpoint's key step.
- **Role-CHECK name**: assumed `profiles_role_check` (Postgres default). If Lovable reports a different name, adjust Task 1's `drop constraint`.
- **estado month-probe** is one extra query over current-month bookings; fine for studio scale. If the member list grows large, fold it into a DB view later.
- **Multiple permissive SELECT policies** on `profiles` (own + staff + admin_all) OR together — intended (staff/own both can read).
- **`recurring_slots` is planning metadata** — it does NOT create bookings (no scope creep into the booking engine).
