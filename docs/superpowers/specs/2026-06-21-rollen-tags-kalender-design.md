# Design: Rollen-Management, Tags, User-DB & Kalender-Ansichten

**Datum:** 2026-06-21
**Status:** Design (genehmigt → Planung)
**Autor:** Brainstorming-Session Tobi
**Sprache:** Spec auf Deutsch, Code/Bezeichner Englisch, UI-Strings Spanisch (Europe/Madrid)

---

## 1. Kontext & Ziel

Cazu Ceramics (Töpfer-Studio Valencia) hat heute ein **binäres Rollenmodell** (`profiles.role ∈ {student, admin}`), einen **Custom-Monats-Kalender** ohne Wochen-/Tagesansicht und eine User-Tabelle (`/admin/alumnas`), die nur Studierende ohne Tags/Aktivitätsstatus zeigt. Diese Erweiterung bringt:

1. **Kalender**: zusätzliche **Wochen-** und **Tagesansicht** (User *und* Admin), umschaltbar.
2. **Rollen**: dritte Rolle **Instructora** zwischen Admin und User; saubere Drei-Stufen-Hierarchie.
3. **Tags**: frei verwaltbare Etiketten (Seed: Horno, Privado, CoWorker) pro Person.
4. **User-DB**: vollwertige Admin-Übersicht über **alle** Personen mit Kontakt, Rolle, Tags, **Aktivitätsstatus** und festem Stammplatz.

## 2. Getroffene Entscheidungen (verbindlich)

| Thema | Entscheidung |
|---|---|
| **Instructora-Rechte** | **Klassen-Managerin**: Admin-Kalender sehen; Klassen anlegen/bearbeiten/absagen; Anwesenheit; Buchungen/Warteliste verschieben; **Sammelnachrichten-Composer nutzen**. KEIN Zugriff auf Finanzen (Pagos/Registro), Plan-Verkauf, Solicitudes/Invites, Rollen-/User-Verwaltung, Tag-Verwaltung. |
| **Tag-Semantik** | Organisatorisch (Filtern/Segmentieren/Nachrichten), **zukunftsoffen** modelliert (Verhalten kann später andocken). Keine Funktions-Gates jetzt. |
| **Aktivitätsstatus** | **Auto + verwalteter Fix-Slot**: automatisch „aktiv" bei Buchung im aktuellen Monat; zusätzlich manuell als `regular` markierbar mit optionalem festem Wochentag+Uhrzeit-Slot, der „aktiv" hält. |
| **Admin-Seeding** | **Einmalige, idempotente Migration** setzt `zuzacande@gmail.com` & `mail.tobiasjung@gmail.com` auf `role='admin'` (greift nur, wenn `profiles`-Zeilen existieren → Accounts müssen mind. 1× registriert sein; Migration ist re-runnable). |
| **Rollenmodell** | DB-Werte `admin | instructora | user` (Migration `student → user`). |
| **Rollen-Label `user`** | UI-Label **„Miembro / Miembros"** (geschlechtsneutral, deckt Alumnos/Alumnas + CoWorker/Privado ab). „alumno/a" nur noch im Kurs-Fließtext. |
| **RLS-Ansatz** | **A1 – Helper-Funktionen, chirurgisch**: neue `is_staff()` / `can_manage_classes()`; nur klassenbezogene Policies/RPCs wechseln; Finanz-/User-Policies bleiben `is_admin()`. |
| **Kalender-Ansatz** | **K1 – Custom, additiv**: neue `WeekGrid` + `DayView` + View-Switcher; `useMonthClasses` → `useClassesInRange`. Keine Kalender-Library. |
| **Ergänzungen (gewählt)** | (a) Tag-Filter → Composer, (b) Instructora↔Klasse verknüpfen (`instructor_id`), (c) Tags + Stammplatz im Klassen-Roster. **Nicht** gewählt: CSV-Export. |

## 3. Scope / Nicht-Scope

**In Scope:** alles aus §2. **Nicht in Scope:** CSV-Export; tag-basierte Funktions-Gates (z. B. Privado→Privatbuchung); Workshops/Block D; Notification-Versand-Änderungen; Stripe-/Finanz-Logik.

---

## 4. Workstream A — Kalender Wochen-/Tagesansicht (Frontend-only)

### A.1 Datenzugriff
- `src/hooks/useMonthClasses.ts` → verallgemeinern zu **`useClassesInRange(startIso, endIso, mode)`** (gleiche Query/Realtime-Logik, nur Range statt Monatsraster). `useMonthClasses` bleibt als dünner Wrapper (`monthGridRange` → `useClassesInRange`) erhalten, damit bestehende Aufrufer unverändert laufen.
- Realtime-Subscriptions (`classes`, `bookings`) wie gehabt.

### A.2 Neue Komponenten (in `src/components/calendar/`)
- **`WeekGrid.tsx`**: 7 Spalten (Mo–So, Europe/Madrid, Montag-first wie `lib/calendar.ts`), vertikales Stundenraster über die belegten Zeiten (z. B. 09:00–22:00, dynamisch aus min/max der Klassen). Klassen als positionierte Blöcke mit Kapazitäts-Dot + `title`/`instructor` + `booked/max`. Klick → bestehendes Detail-/Drawer-Sheet (wie Monat).
- **`DayView.tsx`**: ein Tag als Zeitraster oder kompakte Agenda-Liste (Wiederverwendung der `MobileWeekList`-Zeile, aber auf einen Tag gefiltert).
- **`CalendarHeader.tsx`**: ersetzt/erweitert `MonthHeader.tsx` um einen **View-Switcher** `Mes · Semana · Día` (shadcn `ToggleGroup`/`Tabs`) und kontextsensitive Vor/Zurück-Navigation (± Monat / Woche / Tag) + „Hoy".

### A.3 Routen-Integration
- **User**: `src/routes/app.index.tsx`. **Admin**: `src/routes/admin.clases.tsx`. Beide erhalten Switcher + bedingtes Rendering (`MonthGrid` | `WeekGrid` | `DayView`). Mobile-Fallback bleibt `MobileWeekList` (für Mes) bzw. Tages-Agenda.
- **State**: gewählte Ansicht + Referenzdatum als **URL-Search-Param** (`?view=week&date=2026-06-21`) via TanStack Router `validateSearch` → teilbar/refresh-fest. Default `view=month`.

### A.4 Date-Utilities (`src/lib/calendar.ts`)
- Ergänzen: `weekRange(reference)` (Mo–So ISO-Range), `dayRange(reference)`, `buildWeekDays(reference)`, ggf. `hourSlots(min,max)`. Bestehende ES-Helper (`formatTime`, `formatTimeRange`, `formatLongDate`, Kapazitäts-Helper) wiederverwenden.

---

## 5. Workstream B — Rollen, RLS, Tags, Aktivität, User-DB

### B.1 Rollenmodell
- **Migration** (siehe §6.1): `profiles.role` CHECK → `('admin','instructora','user')`, Default `'user'`; `UPDATE profiles SET role='user' WHERE role='student'`.
- **Frontend** `src/lib/auth.tsx`: `type Role = "admin" | "instructora" | "user"`. Default-Fallback `'user'`. Helper `isStaff(role) = role==='admin' || role==='instructora'`.
- **`src/components/RouteGuard.tsx`**: `requireRole` akzeptiert `Role | Role[]`; zusätzlich Convenience-Props `requireStaff` (admin|instructora) und `requireAdmin`. Redirect: staff → `/admin`, user → `/app`.
- **UI-Labels (ES)**: `role` → `{ admin:'Admin', instructora:'Instructora', user:'Miembro' }`; Plural „Miembros".

### B.2 RLS & Berechtigungen (A1, chirurgisch)
Neue SQL-Funktionen (security definer, `search_path=public`), analog zur bestehenden `is_admin()`:
```sql
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','instructora'));
$$;
create or replace function public.can_manage_classes() returns boolean language sql stable security definer set search_path=public as $$
  select public.is_staff();
$$;
```
**Auf `is_staff()`/`can_manage_classes()` umstellen** (Instructora darf):
- `classes` Policy `classes_admin_all` → `can_manage_classes()`; `classes_select_*` so erweitern, dass Staff alle Status sieht.
- `bookings` Policy `bookings_admin_all` → `is_staff()` (Buchungen verschieben/anlegen für Klassenmgmt).
- `waitlist` Admin-Policy → `is_staff()`.
- RPC `mark_attendance` (`20260619100400`) → Gate `is_staff()`.
- RPC `admin_move_booking`, `admin_grant_makeup` (`20260423144402`) → Gate `is_staff()`.
- **`profiles` SELECT für Staff**: neue Policy `profiles_select_staff USING (is_staff())` — Instructora liest Personen (Roster + Composer-Empfänger). **Schreiben** auf fremde Profile, `role`-Änderungen, Tags bleiben `is_admin()`.

**Bleibt strikt `is_admin()`** (Instructora gesperrt): `subscriptions`, `plans`, `ledger_entries` (`20260621093000`), `enrollment_requests`/`enrollment_request_classes`/`invites` & deren RPCs (`20260619100500/100600/100800`), Profil-Updates/Rollen, Tag-Verwaltung.

**Frontend-Gates** (Backstop = RLS):
- `src/routes/admin.tsx`: `RouteGuard requireStaff`; **Nav-Items rollenabhängig**. Instructora sieht: **Clases, Miembros (read), Mensajes**. Versteckt: Dashboard (finanzlastig), Solicitudes, Pagos, Registro, Notificaciones. Default-Landing Instructora = `/admin/clases`.
- Finanz-/Onboarding-Seiten zusätzlich seitenintern `requireAdmin` (URL-Hack-Schutz; RLS verhindert Datenzugriff ohnehin).
- Composer-Seite (`/admin/mensajes`): für Staff erreichbar.

### B.3 Tags
```sql
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,                      -- optional, für Chip-Farbe
  created_at timestamptz not null default now()
);
create table public.profile_tags (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, tag_id)
);
-- Seed: Horno, Privado, CoWorker
```
**RLS:** `tags`/`profile_tags` SELECT = `is_staff()`; INSERT/UPDATE/DELETE = `is_admin()`.
**Admin-UI:** Tag-Verwaltung (neue Tags anlegen, Farbe wählen, löschen) als Panel — entweder kleiner Bereich in der User-DB-Seite oder in einem Settings-/Admin-Unterbereich. Mehrfachzuweisung pro Person im Detail-Sheet (Multi-Select mit Chips).

### B.4 Aktivität & Stammplatz
```sql
alter table public.profiles
  add column if not exists membership_status text not null default 'active'
    check (membership_status in ('active','paused','inactive')),
  add column if not exists is_regular boolean not null default false;

create table public.recurring_slots (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),  -- 0=Mo … 6=So (zu lib/calendar.ts passend)
  start_time time not null,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
```
**RLS `recurring_slots`:** SELECT eigener (`student_id = auth.uid()`) ODER `is_staff()`; Schreiben `is_admin()` (Verwaltung durch Cande; ggf. später Instructora).

**Abgeleiteter Anzeige-Status `estado`** (im Frontend/Query berechnet, kein DB-Enum):
- `membership_status = 'paused'` → **„Pausada"**
- `membership_status = 'inactive'` → **„Inactiva"**
- sonst: **„Activa"** wenn (Buchung im aktuellen Monat — Europe/Madrid) ODER `is_regular`; andernfalls **„Sin actividad este mes"**.

Für die Buchungs-Erkennung des aktuellen Monats: bestehende `bookings` über `classes.date` joinen, Monatsgrenze via `date_trunc('month', now() at time zone 'Europe/Madrid')` (Muster existiert bereits in den Plan-RPCs). Optional als Helper-View/RPC `student_activity(month)` bündeln.

### B.5 User-DB „Miembros" (`src/routes/admin.alumnas.tsx`)
- Aus der Alumnas-Tabelle wird die vollwertige **Personas/Miembros-DB** (Sidebar-Label „Miembros"; Route-Datei kann bleiben oder zu `admin.miembros.tsx` umziehen — Implementierungs-Detail im Plan).
- **Query**: alle `role IN ('user','instructora','admin')` (nicht mehr nur `student`); plus Tags (`profile_tags`+`tags`), `membership_status`, `is_regular`, Stammplätze, aktueller Plan/Credits, Recuperaciones, abgeleitetes `estado`.
- **Spalten**: Nombre · Email · WhatsApp · **Rol** · **Tags** (Chips) · **Estado** · Plan/Créditos · Recup. · Acciones.
- **Filter**: nach **Rol**, **Tag**, **Estado**; Freitext-Suche (Name/Email/WhatsApp) bleibt.
- **Detail-Sheet** erweitern: Tag-Zuweisung (Multi-Select), `membership_status` umschalten, `is_regular` + **Stammplatz-Editor** (Wochentag+Uhrzeit, mehrere Slots), bestehende Reservas/Pagos/Notificaciones-Tabs bleiben.

### B.6 Gewählte Ergänzungen
- **(a) Tag-Filter → Composer**: Aus der gefilterten Miembros-Liste (z. B. Tag „CoWorker") die Empfängergruppe an `/admin/mensajes` übergeben (URL-Param oder Shared State) → vorbefüllte Empfängerliste im bestehenden Composer (kein Auto-Versand, Copy-Workflow bleibt).
- **(b) Instructora↔Klasse**: `alter table public.classes add column if not exists instructor_id uuid references public.profiles(id)`. Freitext `instructor` bleibt als Fallback/Anzeige. Klassen-Formular: Instructora-Auswahl (Profile mit `role='instructora'`). Admin-Kalender: Filter **„Mis clases"** (`instructor_id = auth.uid()`) für eingeloggte Instructora.
- **(c) Roster-Anzeige**: Im Admin-Klassen-Drawer (`admin.clases.tsx`) pro Person **Tags (Chips)** und **Stammplatz-Marker** zusätzlich zu Name/Email/Anwesenheit anzeigen.

---

## 6. Datenmodell — Migrationen (idempotent, Lovable-Cloud-safe)

Neue Migrationen unter `supabase/migrations/` (Namensschema `20260621NNNNNN_*.sql`), strikt idempotent (`if not exists`, `drop policy if exists` vor `create policy`, `UPDATE` statt destructiver Änderungen). Reihenfolge:

1. **`..._roles_user_rename.sql`** — `profiles.role` CHECK erweitern + Default `'user'`; `UPDATE … student→user`. (CHECK via `drop constraint if exists` + neu.)
2. **`..._staff_functions_and_policies.sql`** — `is_staff()`, `can_manage_classes()`; betroffene Policies droppen & neu (classes/bookings/waitlist), `profiles_select_staff`; RPC-Gates (`mark_attendance`, `admin_move_booking`, `admin_grant_makeup`) auf `is_staff()`.
3. **`..._tags.sql`** — `tags`, `profile_tags` + RLS + Seed (Horno/Privado/CoWorker).
4. **`..._membership_and_slots.sql`** — `profiles.membership_status`, `is_regular`; `recurring_slots` + RLS.
5. **`..._classes_instructor_id.sql`** — `classes.instructor_id` FK.
6. **`..._seed_admins.sql`** — `UPDATE profiles SET role='admin' WHERE email IN (…) ` (re-runnable; no-op falls Zeilen fehlen).

**Hinweis:** `src/integrations/supabase/types.ts` ist veraltet (kennt `title`/`instructor` nicht) → in Lovable Cloud nach den Migrationen neu generieren, neue Spalten/Tabellen aufnehmen.

## 7. Plan-Schnitt (zwei Implementierungspläne)

- **Plan A — Kalender** (Workstream A): rein Frontend, eigenständig, kein DB-Risiko. Kann zuerst und unabhängig gehen.
- **Plan B — Rollen/Tags/Aktivität/User-DB** (Workstream B inkl. Ergänzungen): Migrationen + RLS + Frontend. Reihenfolge §6, dann Frontend (`auth.tsx`, `RouteGuard`, `admin.tsx`-Nav, User-DB-Seite, Klassen-Drawer, Composer-Übergabe, Klassen-Formular).

## 8. Risiken & offene Punkte

- **RLS-Regression**: `is_admin()` ist breit gestreut (7 Migrationen, foundational mit 12 Treffern). Risiko, dass Instructora zu viel/zu wenig sieht. → Policy-Änderungen explizit auflisten und einzeln verifizieren (siehe §9).
- **Rollen-Rename `student→user`**: alle Frontend-Literale (`auth.tsx`, `RouteGuard`, Redirects, evtl. Tests) müssen mit. Grep `"student"` vor Abschluss.
- **Admin-Seeding-Vorbedingung**: greift nur bei existierenden `profiles`-Zeilen. Falls ein Account noch nicht registriert ist → Migration nach Registrierung erneut laufen lassen (idempotent).
- **`recurring_slots` Mehrfach-Slots**: bewusst 0..n statt 2 Spalten — minimal mehr UI, aber sauber. Falls YAGNI gewünscht: auf einen Slot reduzieren.
- **Stammplatz vs. echte Buchung**: Stammplatz ist Planungs-/Statusinfo, erzeugt **keine** automatische Buchung (kein Scope-Creep ins Buchungssystem).

## 9. Verifikation

- **DB/RLS**: Pro umgestellter Policy mit `instructora`- und `user`-Test-Session prüfen: Instructora kann Klassen/Anwesenheit/Buchungen managen + Composer-Empfänger lesen, aber NICHT `subscriptions`/`ledger_entries`/`enrollment_*`/fremde Profil-Updates/Tags-Schreiben. User sieht nur Eigenes.
- **Frontend**: `tsc` clean; Nav zeigt rollenkorrekte Items; URL-Hack auf `/admin/pagos` als Instructora → Redirect + leere/abgelehnte Daten.
- **Kalender**: Mes/Semana/Día rendern dieselben Klassen konsistent (Kapazitäts-Dots, Klick→Detail), URL-Param refresh-fest, Realtime aktualisiert alle Ansichten. User- und Admin-Kalender beide.
- **Aktivität**: `estado`-Ableitung gegen Beispiele (gebucht / nur regular / pausiert / nichts) prüfen.
- Verifikation über Preview-Workflow (Dev-Server) wo sinnvoll.
