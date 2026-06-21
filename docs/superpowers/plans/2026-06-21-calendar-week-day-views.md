# Calendar Week/Day Views — Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add switchable **month / week / day** views to both the student calendar (`/app/`) and the admin calendar (`/admin/clases`), with view+date kept in the URL.

**Architecture:** Custom, additive (no calendar library). Generalize the data hook to an arbitrary date range, add pure date/range helpers, add three presentational components (`CalendarHeader` with a view switcher, `WeekGrid` desktop time-grid, `DayView`) plus a generic `AgendaList` and a `CalendarBoard` that renders the correct view. Both routes become thin: they own URL search state (`?view=&date=`) and the existing detail sheet/drawer; everything else is shared.

**Tech Stack:** TanStack Start/Router (file-based routes, `validateSearch`), React 19, Tailwind v4, shadcn/ui (`ToggleGroup`), Supabase Realtime, zod. Spec: [2026-06-21-rollen-tags-kalender-design.md](../specs/2026-06-21-rollen-tags-kalender-design.md) §4.

**Verification model:** This repo has **no test runner and we are not adding one** (keep it simple — explicit decision). Everything is verified with `npx tsc --noEmit`, `npm run lint`, and the Lovable preview workflow. Pure date/range helpers carry inline `// e.g.` expectation comments and are exercised for real by the week/day rendering in the wiring tasks (9–10) — that rendering is their behavioral proof.

> Package manager: repo has both `bun.lockb` and `package-lock.json`. Commands below use `npm`/`npx`; `bun`/`bunx` equivalents work too. We commit directly to `main` (project convention).

---

## File Structure

**Create:**
- `src/lib/calendar-view.ts` — `CalendarView` type, zod search schema, `parseReference`, `rangeForView`, `shiftReference`, `viewTitle`.
- `src/hooks/useClassesInRange.ts` — core fetch+realtime hook over an ISO date range; owns `ClassRow`/`ClassWithCount` types.
- `src/components/calendar/CalendarHeader.tsx` — nav + title + `Mes·Semana·Día` switcher.
- `src/components/calendar/AgendaList.tsx` — generic “group classes by day” list (mobile week / day).
- `src/components/calendar/WeekGrid.tsx` — desktop 7-day time grid.
- `src/components/calendar/DayView.tsx` — single-day view (heading + AgendaList).
- `src/components/calendar/CalendarBoard.tsx` — renders the correct view + loading skeleton.

**Modify:**
- `src/lib/calendar.ts` — add `addDays`, `addWeeks`, `startOfWeek`, `buildWeekDays`, `weekRange`, `dayRange`, `formatWeekTitle`, `formatDayTitle`, `dayHourBounds`.
- `src/hooks/useMonthClasses.ts` — becomes a thin wrapper over `useClassesInRange`; re-exports the types.
- `src/routes/app.index.tsx` — URL search state + `CalendarHeader` + `CalendarBoard`.
- `src/routes/admin.clases.tsx` — same wiring.

**Delete (after both routes migrated):**
- `src/components/calendar/MonthHeader.tsx` — replaced by `CalendarHeader`.

---

## Task 1: Date helpers in `lib/calendar.ts`

**Files:**
- Modify: `src/lib/calendar.ts` (append; reuse existing private `mondayIndex`, `toIsoDate`, `sameDay`, `ES_MONTHS`, `formatLongDate`)

- [ ] **Step 1: Implement the helpers**

Append to `src/lib/calendar.ts` (after the existing exports; these reuse the file-private `mondayIndex` and existing `toIsoDate`/`sameDay`/`ES_MONTHS`/`formatLongDate`):

```ts
export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

export function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

/** Monday (00:00 local) of the week containing `reference`. */
export function startOfWeek(reference: Date): Date {
  const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  start.setDate(start.getDate() - mondayIndex(reference));
  return start;
}

/**
 * 7 day cells Mon..Sun for the week containing `reference`.
 * e.g. buildWeekDays(2026-06-21 Sun) → days[0].iso "2026-06-15", days[6].iso "2026-06-21".
 */
export function buildWeekDays(reference: Date): DayCell[] {
  const start = startOfWeek(reference);
  const today = new Date();
  const cells: DayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    cells.push({
      date: d,
      iso: toIsoDate(d),
      inMonth: d.getMonth() === reference.getMonth(),
      isToday: sameDay(d, today),
    });
  }
  return cells;
}

/** Inclusive ISO range Mon..Sun for the week containing `reference`. */
export function weekRange(reference: Date): { startIso: string; endIso: string } {
  const days = buildWeekDays(reference);
  return { startIso: days[0].iso, endIso: days[6].iso };
}

/** Inclusive ISO range for a single day. */
export function dayRange(reference: Date): { startIso: string; endIso: string } {
  const iso = toIsoDate(reference);
  return { startIso: iso, endIso: iso };
}

/**
 * e.g. same-month "15 – 21 junio 2026"; cross-month "29 jun – 5 jul 2026".
 */
export function formatWeekTitle(reference: Date): string {
  const days = buildWeekDays(reference);
  const a = days[0].date;
  const b = days[6].date;
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()} – ${b.getDate()} ${ES_MONTHS[a.getMonth()]} ${b.getFullYear()}`;
  }
  return `${a.getDate()} ${ES_MONTHS[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${ES_MONTHS[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`;
}

/** e.g. formatDayTitle(2026-06-21) → "domingo 21 de junio". */
export function formatDayTitle(reference: Date): string {
  return formatLongDate(toIsoDate(reference));
}

/**
 * [minHour, maxHour] (inclusive) spanning the given "HH:MM:SS" times; [9, 22] when empty.
 * e.g. ["18:30:00","20:00:00"] → [18, 20]; [] → [9, 22].
 */
export function dayHourBounds(times: string[]): [number, number] {
  if (times.length === 0) return [9, 22];
  let min = 23;
  let max = 0;
  for (const t of times) {
    const h = Number(t.slice(0, 2));
    if (h < min) min = h;
    if (h > max) max = h;
  }
  return [Math.max(0, min), Math.min(23, max)];
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors; the existing `mondayIndex`/`toIsoDate`/etc. are in the same file).

- [ ] **Step 3: Commit**

```bash
git add src/lib/calendar.ts
git commit -m "feat(calendar): add week/day date + range helpers"
```

---

## Task 2: View helpers in `lib/calendar-view.ts`

**Files:**
- Create: `src/lib/calendar-view.ts`

- [ ] **Step 1: Implement `calendar-view.ts`**

Create `src/lib/calendar-view.ts`:

```ts
import { z } from "zod";
import {
  addDays,
  addMonths,
  addWeeks,
  dayRange,
  formatDayTitle,
  formatMonthTitle,
  formatWeekTitle,
  monthGridRange,
  weekRange,
} from "@/lib/calendar";

export type CalendarView = "month" | "week" | "day";

// Bad/missing params fall back to month + undefined date (no throw on navigation).
export const calendarSearchSchema = z.object({
  view: z.enum(["month", "week", "day"]).catch("month"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
});
export type CalendarSearch = z.infer<typeof calendarSearchSchema>;

/** ISO date param → local Date; falls back to "now" when absent/invalid. */
export function parseReference(dateParam?: string): Date {
  if (dateParam) {
    const [y, m, d] = dateParam.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return new Date();
}

/** week → Mon..Sun; day → single day; month → 6-week grid range. */
export function rangeForView(view: CalendarView, reference: Date): { startIso: string; endIso: string } {
  if (view === "week") return weekRange(reference);
  if (view === "day") return dayRange(reference);
  return monthGridRange(reference);
}

/** Step the reference by one unit of the active view. */
export function shiftReference(view: CalendarView, reference: Date, dir: -1 | 1): Date {
  if (view === "week") return addWeeks(reference, dir);
  if (view === "day") return addDays(reference, dir);
  return addMonths(reference, dir);
}

/** month "junio 2026" · week "15 – 21 junio 2026" · day "domingo 21 de junio". */
export function viewTitle(view: CalendarView, reference: Date): string {
  if (view === "week") return formatWeekTitle(reference);
  if (view === "day") return formatDayTitle(reference);
  return formatMonthTitle(reference);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/calendar-view.ts
git commit -m "feat(calendar): add view/search helpers (month/week/day)"
```

---

## Task 3: Generalize the data hook → `useClassesInRange`

**Files:**
- Create: `src/hooks/useClassesInRange.ts`
- Modify: `src/hooks/useMonthClasses.ts`

- [ ] **Step 1: Create `useClassesInRange.ts`**

Move the fetch+realtime core out of `useMonthClasses.ts` into a range-based hook. Create `src/hooks/useClassesInRange.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ClassRow = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity_ideal: number;
  capacity_max: number;
  status: "scheduled" | "auto_cancelled" | "cancelled_by_admin";
};

export type ClassWithCount = ClassRow & {
  booked_count: number;
};

const ACTIVE_BOOKING_STATUSES = ["reserved", "confirmed", "attended"] as const;

/**
 * Fetches classes within an inclusive ISO date range, plus a live booked count
 * per class. Subscribes to Realtime on classes + bookings and refetches on change.
 *
 * @param range  inclusive { startIso, endIso } (YYYY-MM-DD)
 * @param mode   "student" hides non-scheduled classes; "admin" shows all.
 */
export function useClassesInRange(
  range: { startIso: string; endIso: string },
  mode: "student" | "admin",
) {
  const { startIso, endIso } = range;
  const [classes, setClasses] = useState<ClassWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    let q = supabase
      .from("classes")
      .select("id, date, start_time, end_time, capacity_ideal, capacity_max, status")
      .gte("date", startIso)
      .lte("date", endIso)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (mode === "student") {
      q = q.eq("status", "scheduled");
    }

    const { data: classRows, error: classErr } = await q;
    if (classErr) {
      setError(classErr.message);
      setLoading(false);
      return;
    }

    const ids = (classRows ?? []).map((c) => c.id);
    let counts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: bookings, error: bErr } = await supabase
        .from("bookings")
        .select("class_id, status")
        .in("class_id", ids)
        .in("status", ACTIVE_BOOKING_STATUSES as unknown as string[]);
      if (bErr) {
        setError(bErr.message);
        setLoading(false);
        return;
      }
      counts = (bookings ?? []).reduce((acc, b) => {
        acc.set(b.class_id, (acc.get(b.class_id) ?? 0) + 1);
        return acc;
      }, new Map<string, number>());
    }

    setClasses(
      (classRows ?? []).map((c) => ({
        ...(c as ClassRow),
        booked_count: counts.get(c.id) ?? 0,
      })),
    );
    setLoading(false);
  }, [startIso, endIso, mode]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel(`classes-range-${startIso}-${endIso}-${mode}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "classes" },
        () => void fetchData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => void fetchData(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchData, startIso, endIso, mode]);

  return { classes, loading, error, refresh: fetchData };
}
```

- [ ] **Step 2: Replace `useMonthClasses.ts` with a thin wrapper**

Overwrite `src/hooks/useMonthClasses.ts` so existing consumers (`@/hooks/useMonthClasses` imports of the types or the hook) keep working unchanged:

```ts
import { monthGridRange } from "@/lib/calendar";
import { useClassesInRange } from "./useClassesInRange";

export type { ClassRow, ClassWithCount } from "./useClassesInRange";

/** Back-compat wrapper: classes for the visible month grid. */
export function useMonthClasses(referenceMonth: Date, mode: "student" | "admin") {
  return useClassesInRange(monthGridRange(referenceMonth), mode);
}
```

- [ ] **Step 3: Typecheck (no consumer should break)**

Run: `npx tsc --noEmit`
Expected: PASS — `MonthGrid.tsx`, `MobileWeekList.tsx`, `app.index.tsx`, `admin.clases.tsx` still resolve `ClassWithCount` from `@/hooks/useMonthClasses` via the re-export.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useClassesInRange.ts src/hooks/useMonthClasses.ts
git commit -m "refactor(calendar): extract useClassesInRange; useMonthClasses wraps it"
```

---

## Task 4: `AgendaList` component (generic grouped list)

**Files:**
- Create: `src/components/calendar/AgendaList.tsx`

- [ ] **Step 1: Implement `AgendaList.tsx`**

Generic version of `MobileWeekList` that groups whatever classes it receives by day (no month filtering). Create `src/components/calendar/AgendaList.tsx`:

```tsx
import {
  capacityDotClass,
  capacityLabel,
  capacityLevel,
  formatLongDate,
  formatTimeRange,
} from "@/lib/calendar";
import type { ClassWithCount } from "@/hooks/useMonthClasses";

type Props = {
  classes: ClassWithCount[];
  onSelectClass: (c: ClassWithCount) => void;
  emptyLabel?: string;
};

export function AgendaList({ classes, onSelectClass, emptyLabel = "No hay clases programadas." }: Props) {
  const grouped = new Map<string, ClassWithCount[]>();
  for (const c of classes) {
    const arr = grouped.get(c.date) ?? [];
    arr.push(c);
    grouped.set(c.date, arr);
  }
  const days = Array.from(grouped.keys()).sort();

  if (days.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground shadow-card">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {days.map((day) => (
        <section key={day}>
          <h3 className="text-label mb-2 capitalize">{formatLongDate(day)}</h3>
          <ul className="space-y-2">
            {(grouped.get(day) ?? []).map((c) => {
              const level = capacityLevel(c.booked_count, c.capacity_max);
              const cancelled = c.status !== "scheduled";
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelectClass(c)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left shadow-card transition-colors hover:bg-accent"
                  >
                    <span
                      className={[
                        "h-2.5 w-2.5 shrink-0 rounded-full",
                        cancelled ? "bg-muted-foreground" : capacityDotClass(level),
                      ].join(" ")}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">
                        {formatTimeRange(c.start_time, c.end_time)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {cancelled ? "Cancelada" : capacityLabel(level)}
                      </div>
                    </div>
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {c.booked_count}/{c.capacity_max}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/AgendaList.tsx
git commit -m "feat(calendar): add generic AgendaList component"
```

---

## Task 5: `WeekGrid` component (desktop time grid)

**Files:**
- Create: `src/components/calendar/WeekGrid.tsx`

- [ ] **Step 1: Implement `WeekGrid.tsx`**

A horizontally-scrollable 8-column grid (time gutter + 7 days), one row per hour from `dayHourBounds`; each class sits in its day column at its start-hour row (multiple classes in a cell stack). Create `src/components/calendar/WeekGrid.tsx`:

```tsx
import {
  buildWeekDays,
  capacityDotClass,
  capacityLevel,
  dayHourBounds,
  ES_WEEKDAYS_SHORT,
  formatTime,
} from "@/lib/calendar";
import type { ClassWithCount } from "@/hooks/useMonthClasses";

type Props = {
  reference: Date;
  classes: ClassWithCount[];
  onSelectClass: (c: ClassWithCount) => void;
};

export function WeekGrid({ reference, classes, onSelectClass }: Props) {
  const days = buildWeekDays(reference);
  const [minH, maxH] = dayHourBounds(classes.map((c) => c.start_time));
  const hours: number[] = [];
  for (let h = minH; h <= maxH; h++) hours.push(h);

  const byDay = new Map<string, ClassWithCount[]>();
  for (const c of classes) {
    const arr = byDay.get(c.date) ?? [];
    arr.push(c);
    byDay.set(c.date, arr);
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
      <div className="min-w-[760px]">
        {/* Header: time gutter + 7 day columns */}
        <div className="grid grid-cols-8 border-b border-border">
          <div className="px-2 py-2" />
          {days.map((d, i) => (
            <div key={d.iso} className="px-2 py-2 text-center">
              <div className="text-label uppercase">{ES_WEEKDAYS_SHORT[i]}</div>
              <span
                className={[
                  "mx-auto mt-1 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full text-xs font-medium",
                  d.isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                ].join(" ")}
              >
                {d.date.getDate()}
              </span>
            </div>
          ))}
        </div>

        {/* One row per hour */}
        {hours.map((h) => (
          <div key={h} className="grid grid-cols-8 border-b border-border last:border-b-0">
            <div className="px-2 py-2 text-right text-xs tabular-nums text-muted-foreground">
              {String(h).padStart(2, "0")}:00
            </div>
            {days.map((d) => {
              const cellClasses = (byDay.get(d.iso) ?? []).filter(
                (c) => Number(c.start_time.slice(0, 2)) === h,
              );
              return (
                <div key={d.iso + h} className="min-h-[48px] space-y-1 border-l border-border p-1">
                  {cellClasses.map((c) => {
                    const level = capacityLevel(c.booked_count, c.capacity_max);
                    const cancelled = c.status !== "scheduled";
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onSelectClass(c)}
                        className={[
                          "flex w-full items-center gap-1.5 rounded-md border border-border px-1.5 py-1 text-left text-xs transition-colors",
                          cancelled
                            ? "bg-muted text-muted-foreground line-through"
                            : "bg-background hover:bg-accent hover:text-foreground",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "h-2 w-2 shrink-0 rounded-full",
                            cancelled ? "bg-muted-foreground" : capacityDotClass(level),
                          ].join(" ")}
                          aria-hidden
                        />
                        <span className="truncate font-medium">{formatTime(c.start_time)}</span>
                        <span className="ml-auto tabular-nums text-muted-foreground">
                          {c.booked_count}/{c.capacity_max}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/WeekGrid.tsx
git commit -m "feat(calendar): add desktop WeekGrid time view"
```

---

## Task 6: `DayView` component

**Files:**
- Create: `src/components/calendar/DayView.tsx`

- [ ] **Step 1: Implement `DayView.tsx`**

Create `src/components/calendar/DayView.tsx`:

```tsx
import { AgendaList } from "./AgendaList";
import { formatDayTitle } from "@/lib/calendar";
import type { ClassWithCount } from "@/hooks/useMonthClasses";

type Props = {
  reference: Date;
  classes: ClassWithCount[];
  onSelectClass: (c: ClassWithCount) => void;
};

export function DayView({ reference, classes, onSelectClass }: Props) {
  return (
    <div className="space-y-3">
      <h2 className="text-h2 capitalize">{formatDayTitle(reference)}</h2>
      <AgendaList classes={classes} onSelectClass={onSelectClass} emptyLabel="No hay clases este día." />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/DayView.tsx
git commit -m "feat(calendar): add DayView"
```

---

## Task 7: `CalendarHeader` component (view switcher + nav)

**Files:**
- Create: `src/components/calendar/CalendarHeader.tsx`

- [ ] **Step 1: Implement `CalendarHeader.tsx`**

Create `src/components/calendar/CalendarHeader.tsx` (uses the existing shadcn `ToggleGroup` at `@/components/ui/toggle-group`):

```tsx
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { viewTitle, type CalendarView } from "@/lib/calendar-view";

type Props = {
  view: CalendarView;
  reference: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (v: CalendarView) => void;
  rightSlot?: React.ReactNode;
};

export function CalendarHeader({
  view,
  reference,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  rightSlot,
}: Props) {
  const title = viewTitle(view, reference);
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" onClick={onPrev} aria-label="Anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-h2 min-w-[14ch] text-center capitalize lg:text-left">{title}</h2>
        <Button type="button" variant="outline" size="icon" onClick={onNext} aria-label="Siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onToday} className="ml-1">
          Hoy
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && onViewChange(v as CalendarView)}
        >
          <ToggleGroupItem value="month" aria-label="Vista mensual">
            Mes
          </ToggleGroupItem>
          <ToggleGroupItem value="week" aria-label="Vista semanal">
            Semana
          </ToggleGroupItem>
          <ToggleGroupItem value="day" aria-label="Vista diaria">
            Día
          </ToggleGroupItem>
        </ToggleGroup>
        {rightSlot ? <div className="flex items-center gap-2">{rightSlot}</div> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (If `ToggleGroup`/`ToggleGroupItem` are not exported from this repo's `toggle-group.tsx`, open that file and use the exact exported names — but shadcn's standard names are `ToggleGroup` and `ToggleGroupItem`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/CalendarHeader.tsx
git commit -m "feat(calendar): add CalendarHeader with month/week/day switcher"
```

---

## Task 8: `CalendarBoard` component (renders the active view)

**Files:**
- Create: `src/components/calendar/CalendarBoard.tsx`

- [ ] **Step 1: Implement `CalendarBoard.tsx`**

Owns the desktop/mobile split per view and the loading skeleton, so both routes stay thin. Create `src/components/calendar/CalendarBoard.tsx`:

```tsx
import { MonthGrid } from "./MonthGrid";
import { MobileWeekList } from "./MobileWeekList";
import { WeekGrid } from "./WeekGrid";
import { DayView } from "./DayView";
import { AgendaList } from "./AgendaList";
import type { CalendarView } from "@/lib/calendar-view";
import type { ClassWithCount } from "@/hooks/useMonthClasses";

type Props = {
  view: CalendarView;
  reference: Date;
  classes: ClassWithCount[];
  loading: boolean;
  onSelectClass: (c: ClassWithCount) => void;
};

export function CalendarBoard({ view, reference, classes, loading, onSelectClass }: Props) {
  if (loading) return <BoardSkeleton view={view} />;

  if (view === "day") {
    return <DayView reference={reference} classes={classes} onSelectClass={onSelectClass} />;
  }

  if (view === "week") {
    return (
      <>
        <div className="lg:hidden">
          <AgendaList
            classes={classes}
            onSelectClass={onSelectClass}
            emptyLabel="No hay clases esta semana."
          />
        </div>
        <div className="hidden lg:block">
          <WeekGrid reference={reference} classes={classes} onSelectClass={onSelectClass} />
        </div>
      </>
    );
  }

  // month
  return (
    <>
      <div className="lg:hidden">
        <MobileWeekList reference={reference} classes={classes} onSelectClass={onSelectClass} />
      </div>
      <div className="hidden lg:block">
        <MonthGrid reference={reference} classes={classes} onSelectClass={onSelectClass} />
      </div>
    </>
  );
}

function BoardSkeleton({ view }: { view: CalendarView }) {
  if (view === "month") {
    return (
      <>
        <div className="space-y-2 lg:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-surface" />
          ))}
        </div>
        <div className="hidden grid-cols-7 gap-px rounded-xl border border-border bg-border p-px shadow-card lg:grid">
          {Array.from({ length: 42 }).map((_, i) => (
            <div key={i} className="h-[110px] animate-pulse bg-surface" />
          ))}
        </div>
      </>
    );
  }
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-surface" />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/CalendarBoard.tsx
git commit -m "feat(calendar): add CalendarBoard view renderer + skeleton"
```

---

## Task 9: Wire the student calendar (`/app/`)

**Files:**
- Modify: `src/routes/app.index.tsx`

- [ ] **Step 1: Replace imports + `CalendarioPage`, remove the local skeletons**

In `src/routes/app.index.tsx`:

1. Remove these calendar imports:
```tsx
import { addMonths } from "@/lib/calendar";
import { useMonthClasses, type ClassWithCount } from "@/hooks/useMonthClasses";
import { MonthHeader } from "@/components/calendar/MonthHeader";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { MobileWeekList } from "@/components/calendar/MobileWeekList";
```
and add:
```tsx
import { useMemo } from "react";
import { toIsoDate } from "@/lib/calendar";
import { useClassesInRange, type ClassWithCount } from "@/hooks/useClassesInRange";
import {
  calendarSearchSchema,
  parseReference,
  rangeForView,
  shiftReference,
  type CalendarView,
} from "@/lib/calendar-view";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { CalendarBoard } from "@/components/calendar/CalendarBoard";
```
> `useEffect`/`useState` are already imported on line 2 — keep them and add `useMemo` (either extend that import or add the line above). Don't duplicate `useMemo` if already present.

2. Add `validateSearch` to the route definition:
```tsx
export const Route = createFileRoute("/app/")({
  validateSearch: (search) => calendarSearchSchema.parse(search),
  component: CalendarioPage,
});
```

3. Replace the whole `CalendarioPage` function with:
```tsx
function CalendarioPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const view: CalendarView = search.view;
  const reference = useMemo(() => parseReference(search.date), [search.date]);
  const range = useMemo(() => rangeForView(view, reference), [view, reference]);

  const [selected, setSelected] = useState<ClassWithCount | null>(null);
  const { classes, loading, refresh } = useClassesInRange(range, "student");

  const setView = (v: CalendarView) =>
    navigate({ search: (prev) => ({ ...prev, view: v }) });
  const shift = (dir: -1 | 1) =>
    navigate({ search: (prev) => ({ ...prev, date: toIsoDate(shiftReference(view, reference, dir)) }) });
  const goToday = () =>
    navigate({ search: (prev) => ({ ...prev, date: toIsoDate(new Date()) }) });

  return (
    <div className="space-y-6">
      <div>
        <span className="text-label uppercase">Tu mes</span>
        <h1 className="text-h1 mt-1">Calendario</h1>
        <p className="text-body mt-2 text-muted-foreground">
          Clases — toca una clase para ver los detalles.
        </p>
      </div>

      <CalendarHeader
        view={view}
        reference={reference}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onToday={goToday}
        onViewChange={setView}
        rightSlot={
          <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
            <Legend />
          </div>
        }
      />

      <CalendarBoard
        view={view}
        reference={reference}
        classes={classes}
        loading={loading}
        onSelectClass={setSelected}
      />

      <div className="flex items-center gap-3 text-xs text-muted-foreground sm:hidden">
        <Legend />
      </div>

      <ClassDetailsSheet
        cls={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onBooked={() => {
          setSelected(null);
          void refresh();
        }}
      />
    </div>
  );
}
```

4. Delete the now-unused `GridSkeleton` and `ListSkeleton` function definitions (their markup moved into `CalendarBoard`). Keep `Legend` and `ClassDetailsSheet`.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS, no unused-symbol warnings for the removed imports/helpers.

- [ ] **Step 3: Verify behavior in the preview**

- Start/locate the dev server (preview_start if needed), open `/app/`.
- preview_snapshot: confirm the `Mes·Semana·Día` toggle renders and **Mes** is active by default.
- preview_click **Semana** → preview_snapshot: a 7-day week grid (desktop) shows the week's classes; URL contains `?view=week`.
- preview_click **Día** → single-day list; prev/next moves by one day; URL has `view=day` + a `date=`.
- preview_click a class in each view → the existing detail sheet opens.
- preview_console_logs: no errors. preview_screenshot for the record.

- [ ] **Step 4: Commit**

```bash
git add src/routes/app.index.tsx
git commit -m "feat(calendar): month/week/day views + URL state on student calendar"
```

---

## Task 10: Wire the admin calendar (`/admin/clases`)

**Files:**
- Modify: `src/routes/admin.clases.tsx`

- [ ] **Step 1: Replace imports + header/board wiring**

In `src/routes/admin.clases.tsx`:

1. Replace calendar imports. Remove:
```tsx
import { addMonths, formatLongDate, formatTimeRange, toIsoDate } from "@/lib/calendar";
import { useMonthClasses, type ClassWithCount } from "@/hooks/useMonthClasses";
import { MonthHeader } from "@/components/calendar/MonthHeader";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { MobileWeekList } from "@/components/calendar/MobileWeekList";
```
and add (note: `formatLongDate`, `formatTimeRange`, `toIsoDate` are still used elsewhere in this file — keep them):
```tsx
import { useMemo } from "react";
import { formatLongDate, formatTimeRange, toIsoDate } from "@/lib/calendar";
import { useClassesInRange, type ClassWithCount } from "@/hooks/useClassesInRange";
import {
  calendarSearchSchema,
  parseReference,
  rangeForView,
  shiftReference,
  type CalendarView,
} from "@/lib/calendar-view";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { CalendarBoard } from "@/components/calendar/CalendarBoard";
```
> `useCallback`/`useEffect`/`useState` are already imported on line 2 — keep them and add `useMemo`.

2. Add `validateSearch` to the route:
```tsx
export const Route = createFileRoute("/admin/clases")({
  validateSearch: (search) => calendarSearchSchema.parse(search),
  component: AdminClassesPage,
});
```

3. In `AdminClassesPage`, remove the `const [reference, setReference] = useState(() => new Date());` line and the `const { classes, loading, refresh } = useMonthClasses(reference, "admin");` line, and insert at the top of the component:
```tsx
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const view: CalendarView = search.view;
  const reference = useMemo(() => parseReference(search.date), [search.date]);
  const range = useMemo(() => rangeForView(view, reference), [view, reference]);

  const setView = (v: CalendarView) =>
    navigate({ search: (prev) => ({ ...prev, view: v }) });
  const shift = (dir: -1 | 1) =>
    navigate({ search: (prev) => ({ ...prev, date: toIsoDate(shiftReference(view, reference, dir)) }) });
  const goToday = () =>
    navigate({ search: (prev) => ({ ...prev, date: toIsoDate(new Date()) }) });

  const { classes, loading, refresh } = useClassesInRange(range, "admin");
```
> Keep the existing `selected`, `createOpen`, `editing` `useState` lines and the `useEffect` that syncs `selected` with `classes`.

4. Replace the `<MonthHeader … />` block + the two mobile/desktop view `<div>`s (the `lg:hidden` and `hidden lg:block` blocks) with:
```tsx
      <CalendarHeader
        view={view}
        reference={reference}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onToday={goToday}
        onViewChange={setView}
      />

      <CalendarBoard
        view={view}
        reference={reference}
        classes={classes}
        loading={loading}
        onSelectClass={setSelected}
      />
```
> The "Crear clase" button stays in the page title row as-is. `ClassFormDialog` still uses `toIsoDate(reference)` for `defaultDate` — unchanged.

5. Delete the now-unused local `GridSkeleton` and `ListSkeleton` definitions in this file (markup moved to `CalendarBoard`).

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Verify behavior in the preview**

- Open `/admin/clases` as an admin.
- preview_snapshot: switcher present; Mes default; admin sees all statuses (blocked/cancelled classes visible, as before).
- Switch to Semana/Día; create a class via "Crear clase" → it appears in the active view (Realtime); click it → the admin drawer opens with roster + attendance toggle (unchanged).
- preview_console_logs: no errors. preview_screenshot.

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin.clases.tsx
git commit -m "feat(calendar): month/week/day views + URL state on admin calendar"
```

---

## Task 11: Remove dead `MonthHeader` + final verification

**Files:**
- Delete: `src/components/calendar/MonthHeader.tsx`

- [ ] **Step 1: Confirm `MonthHeader` has no remaining importers**

Run: `grep -rn "MonthHeader" src/`
Expected: no matches (both routes now use `CalendarHeader`). If any remain, migrate them before deleting.

- [ ] **Step 2: Delete the file**

```bash
git rm src/components/calendar/MonthHeader.tsx
```

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit && npm run lint`
Expected: typecheck clean, lint clean.

- [ ] **Step 4: Preview regression sweep**

- `/app/` and `/admin/clases`: Mes/Semana/Día all render; prev/next/Hoy behave per view; a shared URL like `/app/?view=week&date=2026-06-21` reopens on the correct week after reload; Realtime still updates the visible view; capacity dot colors match the legend.
- preview_screenshot of week view on each route.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(calendar): remove unused MonthHeader"
```

---

## Self-Review

**Spec coverage (§4 of the design doc):**
- Week + day views, user *and* admin → Tasks 5, 6, 9, 10, 11. ✓
- `useMonthClasses` → `useClassesInRange` generalization, wrapper kept → Task 3. ✓
- New `WeekGrid` + `DayView` + view switcher in a `CalendarHeader` → Tasks 5, 6, 7. ✓
- View + reference date as URL search param (`?view=&date=`), refresh-proof → Tasks 2, 9, 10. ✓
- Mobile fallback (agenda for month/week, list for day) → `AgendaList` + `CalendarBoard` (Tasks 4, 8). ✓
- Same capacity colors / click-to-detail / Realtime preserved → reused helpers + unchanged sheets/drawer; Realtime in `useClassesInRange` (Task 3). ✓
- New date helpers (`weekRange`, `dayRange`, `buildWeekDays`, hour bounds) → Task 1. ✓
- *Not in Plan A* (deferred to Plan B): recurring-slot markers in the time grid; role gating. Out of scope here.

**Placeholder scan:** No TBD/TODO; every code step contains complete code; every command has expected output. ✓

**Type consistency:** `ClassWithCount` defined in `useClassesInRange.ts`, re-exported by `useMonthClasses.ts`; components import the type from `@/hooks/useMonthClasses` (back-compat) and routes from `@/hooks/useClassesInRange` — both resolve to the same type. `CalendarView` defined once in `calendar-view.ts` and used everywhere. Hook signature `useClassesInRange({startIso,endIso}, mode)` matches all call sites. ✓
