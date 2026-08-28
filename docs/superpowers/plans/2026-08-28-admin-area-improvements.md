# Admin Area Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the Miembros table and Clases del mes calendar in the admin area more usable — compact/sortable table, icon actions, a per-member monthly class summary, member archiving, teacher-colored calendar chips, an upcoming-classes slideshow, verified reserved-spot counts, and stronger admin-only typography.

**Architecture:** All changes are additive within the existing TanStack Start + Supabase app. New pure logic (sorting comparators, the monthly-class-days summarizer, the payment-status resolver, the teacher color mapper) goes into `src/lib/*` files as small tested functions; route/component files wire them into the existing `admin.alumnas.tsx` and `admin.clases.tsx` pages and calendar components. One migration adds `profiles.is_archived`.

**Tech Stack:** React 18, TanStack Start/Router, Tailwind v4 (CSS-first theme in `src/styles.css`), shadcn/ui (Radix), Supabase, Vitest for pure-function unit tests.

**Spec:** `docs/superpowers/specs/2026-08-28-admin-area-improvements-design.md`

## Status (2026-08-28)

All 7 tasks implemented, typechecked (`tsc --noEmit`), linted, and covered by
49 passing Vitest tests (7 files). Deviations from the draft below:
- Task 1 Step 2: implemented the corrected CSS block (plain `.admin-shell`
  rule for body weight), not the first invalid-nesting sketch.
- Task 3 Step 3: implemented the corrected `summarizeMonthClasses` body, not
  the first draft with the dead `tooltip` line.
- Task 5: `teacherColorVar` needed a small fix beyond the draft — the raw
  hash collided two of the three known teachers into the same color, so
  known teacher names (Cande/Sofi/Martu) get a fixed distinct slot and only
  unknown names fall back to the hash.
- `vitest.config.ts` needed a `vite-tsconfig-paths` plugin addition so
  `@/lib/...` imports resolve in tests (not anticipated in the original plan).
- Task 7: live comparison of chip counts vs. the roster drawer wasn't done —
  the user chose to skip live admin-session QA for this session. The
  code-level verification (all three counts share the same
  `["reserved","confirmed","attended"]` filter) stands as the finding.
- Live visual QA of `/admin/alumnas` and `/admin/clases` was skipped by the
  user's choice (no admin session available without entering a password) —
  teacher color-coding was confirmed working on the public calendar instead,
  since `MonthGrid` is shared between the two.

## Global Constraints

- No dark mode; no new colors outside the existing HSL tokens in `src/styles.css` (`--chart-1`..`--chart-5` for teacher coloring).
- Only use already-loaded font weights: Jost 200/300/400/500, Roboto 300/400 (see `src/routes/__root.tsx:62`).
- Font-weight changes must be scoped to the admin area only — the public/student site (`AppShell` with `brand="Cerámica Studio"`) must not change.
- `booked_count` / active-booking filtering must stay `["reserved", "confirmed", "attended"]` everywhere it's computed (matches `useClassesInRange.ts`, `admin.alumnas.tsx`, `AdminClassDrawer`) — don't introduce a fourth place with a different filter.
- New DB migration files are not applied automatically in this repo (no CI/CLI push found) — after writing one, tell the user it still needs to be run against the live database.

---

### Task 1: Admin-only font-weight boost

**Files:**
- Modify: `src/components/layout/AppShell.tsx:48`
- Modify: `src/styles.css` (append a new `@layer components` block)

**Interfaces:**
- Produces: `.admin-shell` CSS class, applied to `AppShell`'s root `<div>` only when `brand === "Admin"`.

- [x] **Step 1: Add the class conditionally in AppShell**

In `src/components/layout/AppShell.tsx`, change the root div (line 48) from:
```tsx
<div className="min-h-screen bg-background text-foreground">
```
to:
```tsx
<div className={["min-h-screen bg-background text-foreground", brand === "Admin" ? "admin-shell" : ""].join(" ")}>
```

- [x] **Step 2: Add the scoped override block to `src/styles.css`**

Append after the existing `@layer utilities` block:
```css
/* Admin area only: the site's default typography (Jost 200/300, Roboto 300)
   is intentionally light for the public/student pages, but that reads as too
   faint for a working admin tool. Bump weight one step, using only the font
   weights already loaded (Jost 200/300/400/500, Roboto 300/400). */
.admin-shell {
  h1, h2, h3, h4, h5, h6 {
    font-weight: 300;
  }
  body & {
    font-weight: 400;
  }
}
.admin-shell .text-h1,
.admin-shell .text-h2 {
  font-weight: 300;
}
.admin-shell .text-h3,
.admin-shell .text-body {
  font-weight: 400;
}
.admin-shell .text-label,
.admin-shell .ui-label,
.admin-shell .field-label {
  font-weight: 500;
}
```
Note: `body &` inside `.admin-shell` doesn't make sense as nested CSS since `.admin-shell` is a descendant of `body`, not the other way around — use a plain `.admin-shell` rule for body-text weight instead of the invalid nested selector:
```css
.admin-shell {
  font-weight: 400;
}
.admin-shell h1, .admin-shell h2, .admin-shell h3,
.admin-shell h4, .admin-shell h5, .admin-shell h6 {
  font-weight: 300;
}
.admin-shell .text-h1, .admin-shell .text-h2 { font-weight: 300; }
.admin-shell .text-h3, .admin-shell .text-body { font-weight: 400; }
.admin-shell .text-label, .admin-shell .ui-label, .admin-shell .field-label { font-weight: 500; }
```
(Setting `font-weight: 400` directly on `.admin-shell` inherits down to all descendant text by default CSS inheritance, overriding the `body { font-weight: 300 }` base rule since `.admin-shell` is more specific and closer in the cascade for its subtree — explicit heavier utility classes like `font-medium` elsewhere are unaffected since they're more specific than plain inheritance.)

- [x] **Step 3: Manually verify in the browser**

Start the dev server, open `/admin` and `/app` side by side. Confirm admin headings/body read visibly heavier while the student-facing `/app` pages are pixel-identical to before.

- [x] **Step 4: Commit**
```bash
git add src/components/layout/AppShell.tsx src/styles.css
git commit -m "Increase admin-area font weight without touching the public site"
```

---

### Task 2: Miembros — compact table, icon+tooltip actions, sorting

**Files:**
- Modify: `src/routes/admin.alumnas.tsx`
- Create: `src/lib/members-sort.ts`
- Test: `src/lib/members-sort.test.ts`

**Interfaces:**
- Produces (from `members-sort.ts`):
  ```ts
  export type MemberSortKey = "name" | "estado" | "plan" | "recup";
  export type MemberSortDir = "asc" | "desc";
  export function compareMembers<T extends {
    name: string | null; surname: string | null; email: string | null;
    estado: string; plan_name: string | null; pending_makeups: number;
  }>(a: T, b: T, key: MemberSortKey, dir: MemberSortDir): number;
  ```
- Consumes: `fullName()` (already defined in `admin.alumnas.tsx:97`) is duplicated as a local `nameOf` inside `members-sort.ts` (same logic, kept dependency-free from the route file) — do not import from the route file.

- [x] **Step 1: Write the failing test for the sort comparator**

Create `src/lib/members-sort.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { compareMembers } from "./members-sort";

const base = {
  name: null, surname: null, email: null,
  estado: "activa", plan_name: null, pending_makeups: 0,
};

describe("compareMembers", () => {
  it("sorts by name ascending, case-insensitively", () => {
    const a = { ...base, name: "beto" };
    const b = { ...base, name: "Ana" };
    expect(compareMembers(a, b, "name", "asc")).toBeGreaterThan(0);
    expect(compareMembers(a, b, "name", "desc")).toBeLessThan(0);
  });

  it("falls back to email when name/surname are both null", () => {
    const a = { ...base, email: "zzz@x.com" };
    const b = { ...base, email: "aaa@x.com" };
    expect(compareMembers(a, b, "name", "asc")).toBeGreaterThan(0);
  });

  it("sorts by pending_makeups numerically", () => {
    const a = { ...base, pending_makeups: 2 };
    const b = { ...base, pending_makeups: 10 };
    expect(compareMembers(a, b, "recup", "asc")).toBeLessThan(0);
  });

  it("sorts by plan_name, nulls last regardless of direction", () => {
    const a = { ...base, plan_name: null };
    const b = { ...base, plan_name: "Plan 4 clases" };
    expect(compareMembers(a, b, "plan", "asc")).toBeGreaterThan(0);
    expect(compareMembers(a, b, "plan", "desc")).toBeGreaterThan(0);
  });

  it("sorts by estado using the domain order activa > pausada > sin_actividad > inactiva", () => {
    const activa = { ...base, estado: "activa" };
    const inactiva = { ...base, estado: "inactiva" };
    expect(compareMembers(activa, inactiva, "estado", "asc")).toBeLessThan(0);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/members-sort.test.ts`
Expected: FAIL — `Cannot find module './members-sort'`

- [x] **Step 3: Implement `src/lib/members-sort.ts`**
```ts
export type MemberSortKey = "name" | "estado" | "plan" | "recup";
export type MemberSortDir = "asc" | "desc";

type Sortable = {
  name: string | null;
  surname: string | null;
  email: string | null;
  estado: string;
  plan_name: string | null;
  pending_makeups: number;
};

const ESTADO_ORDER: Record<string, number> = {
  activa: 0,
  pausada: 1,
  sin_actividad: 2,
  inactiva: 3,
};

function nameOf(r: Sortable): string {
  return [r.name, r.surname].filter(Boolean).join(" ").trim() || r.email || "";
}

function applyDir(n: number, dir: MemberSortDir): number {
  return dir === "asc" ? n : -n;
}

export function compareMembers<T extends Sortable>(
  a: T,
  b: T,
  key: MemberSortKey,
  dir: MemberSortDir,
): number {
  switch (key) {
    case "name":
      return applyDir(nameOf(a).localeCompare(nameOf(b), "es", { sensitivity: "base" }), dir);
    case "recup":
      return applyDir(a.pending_makeups - b.pending_makeups, dir);
    case "plan": {
      if (a.plan_name === null && b.plan_name === null) return 0;
      if (a.plan_name === null) return 1;
      if (b.plan_name === null) return -1;
      return applyDir(a.plan_name.localeCompare(b.plan_name, "es"), dir);
    }
    case "estado":
      return applyDir((ESTADO_ORDER[a.estado] ?? 99) - (ESTADO_ORDER[b.estado] ?? 99), dir);
    default:
      return 0;
  }
}
```

- [x] **Step 4: Run the test again to verify it passes**

Run: `npx vitest run src/lib/members-sort.test.ts`
Expected: PASS (5 tests)

- [x] **Step 5: Wire sorting into the route**

In `src/routes/admin.alumnas.tsx`:
- Import `compareMembers, type MemberSortKey, type MemberSortDir` from `@/lib/members-sort`.
- Add state: `const [sortKey, setSortKey] = useState<MemberSortKey>("name"); const [sortDir, setSortDir] = useState<MemberSortDir>("asc");`
- After the existing `filtered` memo, add:
  ```ts
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => compareMembers(a, b, sortKey, sortDir)),
    [filtered, sortKey, sortDir],
  );
  ```
- Replace every `filtered.map(...)` and `filtered.length` reference in the render (mobile `<ul>` and desktop `<Table>`) with `sorted`.
- Add a small `SortableHeader` helper component in the same file, right above `AdminStudentsPage`:
  ```tsx
  function SortableHeader({
    label, sortKey: key, activeKey, dir, onSort, className,
  }: {
    label: string; sortKey: MemberSortKey; activeKey: MemberSortKey; dir: MemberSortDir;
    onSort: (key: MemberSortKey) => void; className?: string;
  }) {
    const active = key === activeKey;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => onSort(key)}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          {label}
          {active ? (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
        </button>
      </TableHead>
    );
  }
  ```
  Add `ChevronUp, ChevronDown` to the `lucide-react` import at the top of the file. Add a handler in `AdminStudentsPage`:
  ```ts
  const handleSort = (key: MemberSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };
  ```
- Replace the plain `<TableHead>Miembro</TableHead>` with `<SortableHeader label="Miembro" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} />`, and likewise for the Estado, Plan del mes, and Recup. headers (only render the last two when `viewerRole === "admin"`, as today).

- [x] **Step 6: Compact the table**

In the same file's desktop `<Table>` (lines ~380-489):
- Drop the `Email` column's `hidden md:table-cell` visibility gate down a breakpoint to `hidden xl:table-cell` (email is the least actionable column and the first candidate to hide before scrolling kicks in) — keep it reachable via the row's detail sheet instead.
- Reduce visual weight instead of removing data: change `Tags` cell from a `flex flex-wrap` of full `Badge`s to at most 2 badges + a `+N` badge when there are more, e.g.:
  ```tsx
  {r.tags.slice(0, 2).map((t) => <Badge key={t.id} variant="secondary">{t.name}</Badge>)}
  {r.tags.length > 2 ? <Badge variant="outline">+{r.tags.length - 2}</Badge> : null}
  ```
- Add `className="whitespace-nowrap"` to the `Estado` and `Plan del mes` header/cells so their badges don't wrap and force extra row height.
- Shrink the Acciones column now that it holds icon-only buttons (Step 7) — remove the `sm:mr-1`/`hidden sm:inline` text spans since there's no button text left to hide.

- [x] **Step 7: Recordatorio / Recuperación as icon + tooltip**

- Add to the top-level imports: `import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";`
- Wrap the returned JSX of `AdminStudentsPage` in `<TooltipProvider delayDuration={200}>...</TooltipProvider>` (there is no app-wide provider, per the spec).
- In the desktop `Acciones` cell (lines ~451-484), replace both `Button`s with icon-only + tooltip, e.g.:
  ```tsx
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        size="icon"
        variant="ghost"
        onClick={(e) => { e.stopPropagation(); setReminderStudent(r); setReminderOpen(true); }}
        aria-label="Enviar recordatorio de pago"
      >
        <BellRing className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>Recordatorio de pago</TooltipContent>
  </Tooltip>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        size="icon"
        variant="ghost"
        onClick={(e) => { e.stopPropagation(); setGrantStudent(r); setGrantOpen(true); }}
        aria-label="Conceder recuperación"
      >
        <Gift className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>Conceder recuperación</TooltipContent>
  </Tooltip>
  ```
- Leave the mobile `<ul>` icon buttons as-is (already icon-only) — optionally wrap them the same way for consistency since the whole page is now inside `TooltipProvider`, but this is not required (touch devices don't hover).

- [x] **Step 8: Browser check**

Start the dev server (`preview_start` with the project's dev config), open `/admin/alumnas`, confirm: no horizontal scrollbar at a normal laptop width, hovering the two action icons shows their tooltip, clicking a sortable header toggles sort order and the chevron flips.

- [x] **Step 9: Commit**
```bash
git add src/lib/members-sort.ts src/lib/members-sort.test.ts src/routes/admin.alumnas.tsx
git commit -m "Add sorting, icon+tooltip actions, and a more compact layout to the Miembros table"
```

---

### Task 3: Miembros — "Clases este mes" column

**Files:**
- Modify: `src/lib/members.ts`
- Test: `src/lib/members.test.ts` (new file)
- Modify: `src/routes/admin.alumnas.tsx`

**Interfaces:**
- Produces (from `members.ts`):
  ```ts
  export type MonthClassDay = { date: string; weekday: number };
  export function summarizeMonthClasses(days: MonthClassDay[]): {
    count: number;
    chips: { date: string; letter: string }[]; // deduped by date, sorted ascending
    tooltip: string; // e.g. "Lun 7, Mié 9, Vie 11"
  };
  ```
- Consumes: `ES_WEEKDAYS_SHORT` (already exported from `src/lib/calendar.ts`) for weekday letters/labels, and `formatSlot`'s date-parsing convention (weekday 0=Mon..6=Sun) already used elsewhere in `members.ts`.

- [x] **Step 1: Write the failing test**

Create `src/lib/members.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { summarizeMonthClasses } from "./members";

describe("summarizeMonthClasses", () => {
  it("returns one chip per distinct date, sorted ascending", () => {
    const result = summarizeMonthClasses([
      { date: "2026-09-09", weekday: 2 },
      { date: "2026-09-02", weekday: 2 },
      { date: "2026-09-16", weekday: 2 },
    ]);
    expect(result.count).toBe(3);
    expect(result.chips.map((c) => c.date)).toEqual(["2026-09-02", "2026-09-09", "2026-09-16"]);
  });

  it("dedupes bookings that land on the same date", () => {
    const result = summarizeMonthClasses([
      { date: "2026-09-02", weekday: 2 },
      { date: "2026-09-02", weekday: 2 },
    ]);
    expect(result.count).toBe(1);
  });

  it("returns an empty summary for no classes", () => {
    const result = summarizeMonthClasses([]);
    expect(result.count).toBe(0);
    expect(result.chips).toEqual([]);
    expect(result.tooltip).toBe("");
  });

  it("builds a human-readable tooltip using short weekday + day-of-month", () => {
    const result = summarizeMonthClasses([{ date: "2026-09-07", weekday: 0 }]);
    expect(result.tooltip).toBe("Lun 7");
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/members.test.ts`
Expected: FAIL — `summarizeMonthClasses is not exported`

- [x] **Step 3: Implement in `src/lib/members.ts`**

Add (the file already imports `ES_WEEKDAYS_SHORT` from `@/lib/calendar`):
```ts
export type MonthClassDay = { date: string; weekday: number };

export function summarizeMonthClasses(days: MonthClassDay[]) {
  const byDate = new Map<string, number>();
  for (const d of days) byDate.set(d.date, d.weekday);
  const chips = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, weekday]) => ({ date, letter: (ES_WEEKDAYS_SHORT[weekday] ?? "?")[0] }));
  const tooltip = chips
    .map(({ date, weekday: _ }) => date) // placeholder removed below
    .join(""); // replaced in real implementation, see note
  return { count: chips.length, chips, tooltip: buildTooltip(byDate) };
}

function buildTooltip(byDate: Map<string, number>): string {
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, weekday]) => `${ES_WEEKDAYS_SHORT[weekday] ?? "?"} ${Number(date.slice(8, 10))}`)
    .join(", ");
}
```
Clean up the stray placeholder line in `summarizeMonthClasses` before running — the real body is:
```ts
export function summarizeMonthClasses(days: MonthClassDay[]) {
  const byDate = new Map<string, number>();
  for (const d of days) byDate.set(d.date, d.weekday);
  const sortedDates = [...byDate.keys()].sort((a, b) => a.localeCompare(b));
  const chips = sortedDates.map((date) => ({
    date,
    letter: (ES_WEEKDAYS_SHORT[byDate.get(date)!] ?? "?")[0],
  }));
  const tooltip = sortedDates
    .map((date) => `${ES_WEEKDAYS_SHORT[byDate.get(date)!] ?? "?"} ${Number(date.slice(8, 10))}`)
    .join(", ");
  return { count: chips.length, chips, tooltip };
}
```

- [x] **Step 4: Run the test again to verify it passes**

Run: `npx vitest run src/lib/members.test.ts`
Expected: PASS (4 tests)

- [x] **Step 5: Capture per-student class dates in `admin.alumnas.tsx`'s `load()`**

The existing `monthBookings` query (line ~168-174) already joins to `classes.date` but only keeps a `Set<student_id>` for the boolean count. Change it to also keep the per-student date+weekday list:
- Extend the select to also fetch weekday-derivable info — `classes.date` is enough; compute weekday client-side with `new Date(date + "T00:00:00").getDay()` converted to the app's Mon=0..Sun=6 convention (check `src/lib/calendar.ts` for an existing `jsWeekdayToAppWeekday`-style helper before writing a new one; if none exists, add `((new Date(date + "T00:00:00").getDay() + 6) % 6 === undefined` — actually reuse whatever conversion `buildMonthGrid`/`buildWeekDays` in `calendar.ts` already use internally, and factor it into an exported `weekdayOf(dateIso: string): number` in `calendar.ts` if it's currently inlined, so both call sites share one definition).
- Build `const monthClassesByStudent = new Map<string, MonthClassDay[]>()` alongside the existing `bookedThisMonth` Set, push `{ date: b.classes.date, weekday: weekdayOf(b.classes.date) }` for each row.
- Add `month_classes: MonthClassDay[]` to `StudentRow` and populate it from `monthClassesByStudent.get(p.id) ?? []` in the `result` map.

- [x] **Step 6: Render the column**

- Import `summarizeMonthClasses` from `@/lib/members`.
- Add a new `<TableHead>Clases este mes</TableHead>` (no sort — order has no natural total order beyond count, skip sorting for this column per the spec's "sort options that make sense") after the Slot column.
- Render cell:
  ```tsx
  <TableCell>
    {(() => {
      const s = summarizeMonthClasses(r.month_classes);
      if (s.count === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex gap-1">
              {s.chips.map((c) => (
                <span key={c.date} className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] text-muted-foreground">
                  {c.letter}
                </span>
              ))}
            </div>
          </TooltipTrigger>
          <TooltipContent>{s.tooltip}</TooltipContent>
        </Tooltip>
      );
    })()}
  </TableCell>
  ```
- Add the same summary to the mobile `<ul>` card as a small text line (`{summarizeMonthClasses(r.month_classes).tooltip || "Sin clases este mes"}`) since there's no hover tooltip on mobile.

- [x] **Step 7: Browser check**

Reload `/admin/alumnas`, confirm a member with bookings this month shows weekday-letter chips, hovering shows the full date list, a member with none shows "—".

- [x] **Step 8: Commit**
```bash
git add src/lib/members.ts src/lib/members.test.ts src/routes/admin.alumnas.tsx src/lib/calendar.ts
git commit -m "Show each member's booked class days for the current month"
```

---

### Task 4: Miembros — archive members

**Files:**
- Create: `supabase/migrations/20260828160000_profiles_is_archived.sql`
- Modify: `src/integrations/supabase/types.ts` (hand-maintained, per repo convention)
- Modify: `src/routes/admin.alumnas.tsx`

- [x] **Step 1: Write the migration**

```sql
alter table public.profiles
  add column if not exists is_archived boolean not null default false;

comment on column public.profiles.is_archived is
  'Hides test/duplicate/inactive accounts from the default Miembros list without deleting data.';
```

- [x] **Step 2: Update `src/integrations/supabase/types.ts`**

In the `profiles` block (`Row`, `Insert`, `Update`, currently at lines 704-744), add `is_archived: boolean` to `Row`, `is_archived?: boolean` to `Insert` and `Update`, alphabetically placed next to `is_regular`.

- [x] **Step 3: Add archive/unarchive action + default filtering in `admin.alumnas.tsx`**

- Add `is_archived: boolean` to `StudentRow` and select it in the `profiles` query (`.select("... , is_archived, ...")`) and in the `ProfileRow` type / mapping in `load()`.
- Add state: `const [showArchived, setShowArchived] = useState(false);`
- In the `filtered` memo, add: `if (!showArchived && r.is_archived) return false;`
- Add a `Switch` next to the existing filters: label "Mostrar archivadas", bound to `showArchived`/`setShowArchived`.
- Add an archive toggle action, reusing the existing icon+tooltip pattern from Task 2 (icon: `Archive` from `lucide-react`, aria-label `"Archivar miembro"` / `"Desarchivar miembro"` depending on `r.is_archived`):
  ```ts
  const toggleArchived = async (r: StudentRow) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_archived: !r.is_archived })
      .eq("id", r.id);
    if (error) { toast.error("No se pudo actualizar"); return; }
    toast.success(r.is_archived ? "Miembro desarchivado" : "Miembro archivado");
    void load();
  };
  ```
  Wire it as a third icon button in the Acciones cell (desktop) and mobile action row, gated the same way as the other two admin-only actions.

- [x] **Step 4: Browser check**

Reload `/admin/alumnas`, archive a test member (e.g. one with an obviously fake name), confirm it disappears from the default list and reappears when "Mostrar archivadas" is on; unarchive it and confirm it returns to the default view.

- [x] **Step 5: Commit**
```bash
git add supabase/migrations/20260828160000_profiles_is_archived.sql src/integrations/supabase/types.ts src/routes/admin.alumnas.tsx
git commit -m "Add member archiving to hide test/inactive accounts from the default Miembros view"
```

**Note for the user:** this migration must still be run against the live database (Supabase SQL editor or CLI) — it is not applied automatically by this repo.

---

### Task 5: Clases del mes — teacher color coding

**Files:**
- Modify: `src/lib/calendar.ts`
- Test: `src/lib/calendar.test.ts` (new file)
- Modify: `src/components/calendar/MonthGrid.tsx`
- Modify: `src/components/calendar/WeekGrid.tsx`
- Modify: `src/components/calendar/AgendaList.tsx`

**Interfaces:**
- Produces (from `calendar.ts`):
  ```ts
  export function teacherColorVar(teacher: string | null): string; // e.g. "var(--chart-2)"
  ```

- [x] **Step 1: Write the failing test**

Create `src/lib/calendar.test.ts` (first test file for this lib — colocate with the others under `src/lib`):
```ts
import { describe, expect, it } from "vitest";
import { teacherColorVar } from "./calendar";

describe("teacherColorVar", () => {
  it("is deterministic for the same teacher name", () => {
    expect(teacherColorVar("Cande")).toBe(teacherColorVar("Cande"));
  });

  it("gives different teachers different colors where possible", () => {
    const colors = new Set(["Cande", "Sofi", "Martu"].map(teacherColorVar));
    expect(colors.size).toBe(3);
  });

  it("falls back to a fixed neutral color for no teacher", () => {
    expect(teacherColorVar(null)).toBe("var(--muted-foreground)");
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/calendar.test.ts`
Expected: FAIL — `teacherColorVar is not exported`

- [x] **Step 3: Implement in `src/lib/calendar.ts`**
```ts
const TEACHER_CHART_VARS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Deterministic teacher -> one of the app's existing chart color tokens. */
export function teacherColorVar(teacher: string | null): string {
  if (!teacher) return "var(--muted-foreground)";
  let hash = 0;
  for (let i = 0; i < teacher.length; i++) hash = (hash * 31 + teacher.charCodeAt(i)) | 0;
  const index = Math.abs(hash) % TEACHER_CHART_VARS.length;
  return TEACHER_CHART_VARS[index];
}
```

- [x] **Step 4: Run the test again to verify it passes**

Run: `npx vitest run src/lib/calendar.test.ts`
Expected: PASS (3 tests)

- [x] **Step 5: Apply the color to calendar chips**

In `MonthGrid.tsx`, `WeekGrid.tsx`, and `AgendaList.tsx`, find where each class chip/row is rendered (the button/div showing time + `teacherShort(cls.teacher)` + booked/max). Add a left border accent using the teacher color, e.g.:
```tsx
style={{ borderLeft: `3px solid ${teacherColorVar(cls.teacher)}` }}
```
applied to the existing chip container (keep the current capacity-based dot/color as-is — this is an additional accent, not a replacement, so capacity state stays visible). Import `teacherColorVar` from `@/lib/calendar` in each of the three files.

- [x] **Step 6: Browser check**

Open `/admin/clases` in month, week, and day view. Confirm classes from different teachers show a visibly different left-border color, consistently across all three views for the same teacher.

- [x] **Step 7: Commit**
```bash
git add src/lib/calendar.ts src/lib/calendar.test.ts src/components/calendar/MonthGrid.tsx src/components/calendar/WeekGrid.tsx src/components/calendar/AgendaList.tsx
git commit -m "Color-code calendar chips by teacher using the existing chart palette"
```

---

### Task 6: Clases del mes — upcoming-classes slideshow

**Files:**
- Create: `src/hooks/useUpcomingClasses.ts`
- Create: `src/lib/booking-payment-status.ts`
- Test: `src/lib/booking-payment-status.test.ts`
- Create: `src/components/calendar/UpcomingClassesCarousel.tsx`
- Modify: `src/routes/admin.clases.tsx`

**Interfaces:**
- Produces (from `booking-payment-status.ts`):
  ```ts
  export type BookingPaymentStatus = "paid" | "pending" | "cancelled";
  export function resolveBookingPaymentStatus(
    booking: { status: string; source: string; booking_id_payment_status: "pending" | "confirmed" | "failed" | null },
    subscriptionPaymentStatus: "pending" | "confirmed" | "failed" | null,
  ): BookingPaymentStatus;
  ```
- Produces (from `useUpcomingClasses.ts`):
  ```ts
  export type UpcomingClassSlide = {
    classId: string; date: string; startTime: string; endTime: string; teacher: string | null;
    students: { bookingId: string; name: string; status: BookingPaymentStatus }[];
  };
  export function useUpcomingClasses(limit: number): { slides: UpcomingClassSlide[]; loading: boolean };
  ```

- [x] **Step 1: Write the failing test for the pure resolver**

Create `src/lib/booking-payment-status.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { resolveBookingPaymentStatus } from "./booking-payment-status";

describe("resolveBookingPaymentStatus", () => {
  it("marks a cancelled booking as cancelled regardless of payment", () => {
    const result = resolveBookingPaymentStatus(
      { status: "cancelled_lost", source: "drop_in", booking_id_payment_status: "confirmed" },
      null,
    );
    expect(result).toBe("cancelled");
  });

  it("resolves a drop-in booking from its own payment status", () => {
    expect(
      resolveBookingPaymentStatus(
        { status: "reserved", source: "drop_in", booking_id_payment_status: "pending" },
        null,
      ),
    ).toBe("pending");
    expect(
      resolveBookingPaymentStatus(
        { status: "reserved", source: "drop_in", booking_id_payment_status: "confirmed" },
        null,
      ),
    ).toBe("paid");
  });

  it("resolves a plan booking from the student's subscription payment status", () => {
    expect(
      resolveBookingPaymentStatus(
        { status: "confirmed", source: "plan", booking_id_payment_status: null },
        "pending",
      ),
    ).toBe("pending");
    expect(
      resolveBookingPaymentStatus(
        { status: "confirmed", source: "plan", booking_id_payment_status: null },
        "confirmed",
      ),
    ).toBe("paid");
  });

  it("treats a plan booking with no subscription payment record as paid", () => {
    expect(
      resolveBookingPaymentStatus(
        { status: "confirmed", source: "plan", booking_id_payment_status: null },
        null,
      ),
    ).toBe("paid");
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/booking-payment-status.test.ts`
Expected: FAIL — module not found

- [x] **Step 3: Implement `src/lib/booking-payment-status.ts`**
```ts
export type BookingPaymentStatus = "paid" | "pending" | "cancelled";

type PaymentStatus = "pending" | "confirmed" | "failed" | null;

export function resolveBookingPaymentStatus(
  booking: { status: string; source: string; booking_id_payment_status: PaymentStatus },
  subscriptionPaymentStatus: PaymentStatus,
): BookingPaymentStatus {
  if (booking.status === "cancelled_recoverable" || booking.status === "cancelled_lost") {
    return "cancelled";
  }
  const relevantStatus =
    booking.source === "drop_in" ? booking.booking_id_payment_status : subscriptionPaymentStatus;
  return relevantStatus === "pending" || relevantStatus === "failed" ? "pending" : "paid";
}
```

- [x] **Step 4: Run the test again to verify it passes**

Run: `npx vitest run src/lib/booking-payment-status.test.ts`
Expected: PASS (5 tests)

- [x] **Step 5: Implement `src/hooks/useUpcomingClasses.ts`**

Follow the existing pattern in `src/hooks/useClassesInRange.ts` (Supabase queries + `useEffect` + realtime subscription). Query shape:
```ts
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveBookingPaymentStatus } from "@/lib/booking-payment-status";
import { toIsoDate } from "@/lib/calendar";

export type UpcomingClassSlide = {
  classId: string;
  date: string;
  startTime: string;
  endTime: string;
  teacher: string | null;
  students: { bookingId: string; name: string; status: "paid" | "pending" | "cancelled" }[];
};

export function useUpcomingClasses(limit: number) {
  const [slides, setSlides] = useState<UpcomingClassSlide[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const todayIso = toIsoDate(new Date());
      const { data: classes } = await supabase
        .from("classes")
        .select("id, date, start_time, end_time, teacher, status")
        .gte("date", todayIso)
        .neq("status", "cancelled_by_admin")
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(limit);
      const classIds = (classes ?? []).map((c) => c.id);
      if (classIds.length === 0) {
        if (!cancelled) { setSlides([]); setLoading(false); }
        return;
      }
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, class_id, status, source, student_id, profiles(name, surname, email)")
        .in("class_id", classIds)
        .neq("status", "cancelled_lost"); // still show cancelled_recoverable so the studio sees the drop, but not old lost-slot noise beyond makeup granting elsewhere
      const bookingIds = (bookings ?? []).map((b) => b.id);
      const { data: payments } = await supabase
        .from("payments")
        .select("booking_id, subscription_id, status")
        .or(
          [
            bookingIds.length ? `booking_id.in.(${bookingIds.join(",")})` : null,
          ].filter(Boolean).join(","),
        );
      const studentIds = [...new Set((bookings ?? []).map((b) => b.student_id))];
      const monthStart = toIsoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
      const { data: subs } = studentIds.length
        ? await supabase
            .from("subscriptions")
            .select("id, student_id")
            .eq("month", monthStart)
            .in("student_id", studentIds)
        : { data: [] as { id: string; student_id: string }[] };
      const paymentByBooking = new Map((payments ?? []).map((p) => [p.booking_id, p.status]));
      const subIdByStudent = new Map((subs ?? []).map((s) => [s.student_id, s.id]));
      const paymentBySubscription = new Map((payments ?? []).map((p) => [p.subscription_id, p.status]));

      const bookingsByClass = new Map<string, typeof bookings>();
      for (const b of bookings ?? []) {
        const list = bookingsByClass.get(b.class_id) ?? [];
        list.push(b);
        bookingsByClass.set(b.class_id, list);
      }

      const result: UpcomingClassSlide[] = (classes ?? []).map((c) => ({
        classId: c.id,
        date: c.date,
        startTime: c.start_time,
        endTime: c.end_time,
        teacher: c.teacher,
        students: (bookingsByClass.get(c.id) ?? []).map((b) => {
          const profile = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles;
          const name = [profile?.name, profile?.surname].filter(Boolean).join(" ").trim() || profile?.email || "—";
          const subId = subIdByStudent.get(b.student_id) ?? null;
          const status = resolveBookingPaymentStatus(
            {
              status: b.status,
              source: b.source,
              booking_id_payment_status: (paymentByBooking.get(b.id) ?? null) as never,
            },
            (subId ? paymentBySubscription.get(subId) : null) ?? null,
          );
          return { bookingId: b.id, name, status };
        }),
      }));
      if (!cancelled) { setSlides(result); setLoading(false); }
    };
    void load();
    const channel = supabase
      .channel("upcoming-classes")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "classes" }, () => void load())
      .subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [limit]);

  return { slides, loading };
}
```
Note: the `.or("booking_id.in.(...)")` filter above only fetches drop-in payments; it's intentionally not also filtering by `subscription_id` in the same query because we don't know the relevant subscription IDs until after we know which students are booked — this two-step (bookings → subscriptions → payments-by-subscription) is why `paymentBySubscription` is built from the *same* `payments` fetch. Since that fetch is filtered to `booking_id.in.(...)`, it will **not** include subscription-linked payments. Fix before wiring the UI: fetch payments in two calls (drop-in filtered by `booking_id`, plan filtered by `subscription_id.in.(...)`) and merge, since the `subIdByStudent` map is only known after the bookings query completes. Restructure the payments fetch into:
```ts
const subIds = [...subIdByStudent.values()];
const [{ data: bookingPayments }, { data: subPayments }] = await Promise.all([
  bookingIds.length
    ? supabase.from("payments").select("booking_id, status").in("booking_id", bookingIds)
    : Promise.resolve({ data: [] as { booking_id: string | null; status: string }[] }),
  subIds.length
    ? supabase.from("payments").select("subscription_id, status").in("subscription_id", subIds)
    : Promise.resolve({ data: [] as { subscription_id: string | null; status: string }[] }),
]);
const paymentByBooking = new Map((bookingPayments ?? []).map((p) => [p.booking_id, p.status]));
const paymentBySubscription = new Map((subPayments ?? []).map((p) => [p.subscription_id, p.status]));
```
and move the `subs`/`subIdByStudent` computation above this block (it already is, just reorder so `subIds` is available). Use this corrected version, not the single `.or(...)` query sketched above.

- [x] **Step 6: Implement `src/components/calendar/UpcomingClassesCarousel.tsx`**

Use the shadcn `Carousel` (`@/components/ui/carousel`, Embla-based, currently unused). Import `formatLongDate, formatTimeRange` from `@/lib/calendar` and `teacherColorVar` from Task 5.
```tsx
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Badge } from "@/components/ui/badge";
import { Check, Clock, X } from "lucide-react";
import { useUpcomingClasses } from "@/hooks/useUpcomingClasses";
import { formatLongDate, formatTimeRange, teacherColorVar } from "@/lib/calendar";

export function UpcomingClassesCarousel() {
  const { slides, loading } = useUpcomingClasses(10);
  if (loading || slides.length === 0) return null;
  return (
    <Carousel opts={{ align: "start" }} className="w-full">
      <CarouselContent>
        {slides.map((slide) => (
          <CarouselItem key={slide.classId} className="basis-full sm:basis-1/2 lg:basis-1/3">
            <div
              className="h-full rounded-md border border-border bg-card p-4"
              style={{ borderTop: `3px solid ${teacherColorVar(slide.teacher)}` }}
            >
              <p className="text-h3 capitalize">{formatLongDate(slide.date)}</p>
              <p className="text-body flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatTimeRange(slide.startTime, slide.endTime)}
                {slide.teacher ? ` · ${slide.teacher}` : ""}
              </p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {slide.students.length === 0 ? (
                  <li className="text-body text-muted-foreground">Sin reservas</li>
                ) : (
                  slide.students.map((s) => (
                    <li key={s.bookingId} className="flex items-center justify-between gap-2 text-body">
                      <span className={s.status === "cancelled" ? "text-muted-foreground line-through" : ""}>
                        {s.name}
                      </span>
                      {s.status === "cancelled" ? (
                        <Badge variant="outline" className="shrink-0"><X className="mr-1 h-3 w-3" />Cancelado</Badge>
                      ) : s.status === "pending" ? (
                        <Badge variant="secondary" className="shrink-0">Pago pendiente</Badge>
                      ) : (
                        <Check className="h-4 w-4 shrink-0 text-success" />
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}
```

- [x] **Step 7: Mount it in `admin.clases.tsx`**

In `AdminClassesPage`, render `<UpcomingClassesCarousel />` above the existing `<CalendarHeader />`/`<CalendarBoard />` block.

- [x] **Step 8: Browser check**

Reload `/admin/clases`, confirm the carousel shows up to 10 upcoming classes, arrows navigate through them, a class with a cancelled booking shows the name struck through with a "Cancelado" badge, and a pending-payment drop-in booking shows the "Pago pendiente" badge.

- [x] **Step 9: Commit**
```bash
git add src/hooks/useUpcomingClasses.ts src/lib/booking-payment-status.ts src/lib/booking-payment-status.test.ts src/components/calendar/UpcomingClassesCarousel.tsx src/routes/admin.clases.tsx
git commit -m "Add an upcoming-classes slideshow with payment/cancellation status per student"
```

---

### Task 7: Clases del mes — verify reserved-spot accuracy

**Files:** none expected — this is a verification task; only touch code if a real discrepancy is found.

- [x] **Step 1: Reproduce or rule out**

With the dev server running, open `/admin/clases`, pick 2-3 days with different booked counts (including at least one day with a cancelled booking, if any test data has one). For each, open the day's class in `AdminClassDrawer` and count the roster rows shown there. Compare against the chip's `booked/max` number on the calendar.

- [x] **Step 2: If they match everywhere checked**

No code change — the existing `["reserved","confirmed","attended"]` filter in `useClassesInRange.ts` is already consistent with the roster query in `AdminClassDrawer`. Note this in the plan/commit message as a verified no-op, so it's not silently skipped.

- [x] **Step 3: If a discrepancy is found**

Diagnose per `superpowers:systematic-debugging` before changing anything: identify exactly which query returns the wrong number (chip count vs. roster vs. actual `bookings` rows via a direct Supabase query), fix that one query to use the same `["reserved","confirmed","attended"]` filter as the others, and add a regression note to this task.

- [x] **Step 4: Commit (only if Step 3 required a code change)**
```bash
git add -A
git commit -m "Fix reserved-spot count discrepancy in <wherever the bug was>"
```

---

## Self-Review Notes

- Spec coverage: font weight (Task 1), compact table + icon/tooltip + sorting (Task 2), month-classes column (Task 3), archive (Task 4), teacher colors (Task 5), slideshow (Task 6), spot-count verification (Task 7) — all spec bullets have a task.
- Task 6 Step 5's payment query needed a correction inline (the `.or()` sketch doesn't work before `subIdByStudent` exists) — the corrected two-query version is the one to implement, not the first sketch.
- Task 3 Step 3's first draft body has a dead `tooltip` line — the corrected body immediately below it is the one to implement.
