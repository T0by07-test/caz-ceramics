# Admin Area Improvements — Design

**Date:** 2026-08-28
**Requested by:** Tobi, via `/goal`

## Problem

Two admin screens need polish and a few real gaps closed:

1. **Miembros** (`/admin/alumnas`) — the table requires horizontal scrolling on a
   normal laptop width, the "Recordatorio"/"Recuperación" actions take up a full
   text button each, there's no way to sort, there's no per-member view of which
   classes they attended this month, and there's no way to hide test/junk
   accounts from the list.
2. **Clases del mes** (`/admin/clases`) — there's no quick way to see what's
   coming up next without scanning the calendar grid, classes from different
   teachers all look the same color, and the reserved-spot counts need to be
   verified/trustworthy.
3. **General** — admin-area text (Jost 200/300 headings, Roboto 300 body) is
   intentionally very light per the site's design system, but that makes the
   admin screens harder to scan than a working tool should be.

## Decisions

### Font weight (admin only)
Scope a weight bump to the admin area only — the public/student site keeps its
current light typography. Add an `admin-shell` class to `AppShell` when
`brand === "Admin"`, and add a `@layer components` block in `src/styles.css`
scoped under `.admin-shell` that raises: body text 300→400, headings 200→300,
`.text-label`/`.ui-label`/`.field-label` 400→500. All of these weights
(Jost 200/300/400/500, Roboto 300/400) are already loaded — no new font
weight to fetch. Because the scoped selector combines a class with an
element/utility selector, it out-specifies the existing Tailwind weight
utility classes used throughout (`font-extralight`, `font-light`, etc.)
without having to touch every call site.

### Miembros table
- **Compact columns:** tighten cell padding/font-size and column min-widths so
  the table fits without horizontal scroll at the app's own max container
  width (1180px desktop).
- **Recordatorio / Recuperación → icon + tooltip:** replace the desktop
  text+icon buttons with icon-only buttons (already the mobile pattern) and
  add a `Tooltip` (shadcn primitive, unused elsewhere in this table) showing
  the action name. Wrap the page in a local `TooltipProvider` since there's no
  app-wide one.
- **Sorting:** add click-to-sort on column headers for Miembro (name), Estado,
  Plan del mes, and Recup. — the columns with an obvious total order in this
  domain. Sort state lives alongside the existing `roleFilter`/`tagFilter`
  state and is applied after the existing `filtered` memo.
- **"Clases este mes" column:** small inline visualization (weekday-letter
  chips, e.g. `L M X`) of which days a member has a class booked this month,
  built from the class dates already joined in the existing bookings→classes
  query (the query already restricts to the current month and active booking
  statuses for the `bookedThisMonth` count — it just needs to keep the dates
  instead of collapsing straight to a count). A tooltip on the chip group
  spells out the full dates. New pure helper `summarizeMonthClasses` in
  `src/lib/members.ts`, unit tested.
- **Archive:** add `profiles.is_archived boolean not null default false` via
  migration (+ manual `types.ts` update, following this repo's existing
  pattern of hand-maintained generated types — see
  `20260828140000_capture_tags_recurring_slots.sql`). Add an "Archivar" /
  "Desarchivar" row action; archived members are excluded from the default
  view behind a "Mostrar archivadas" toggle next to the existing filters.
  This migration file is **not** applied automatically — it needs to be run
  against the live database the same way prior migrations in this repo were
  (Supabase SQL editor / CLI), per the existing project workflow.

### Clases del mes
- **Upcoming-classes slideshow:** a `Carousel` (shadcn/Embla, unused
  elsewhere) at the top of the page, one slide per class, up to the next 10
  upcoming classes (date/time ≥ now). Each slide lists every booked student
  with a status marker: a check for a confirmed/paid booking, a "pending
  payment" badge, or a struck-through name + "cancelado" tag for a cancelled
  booking. New hook `useUpcomingClasses(limit)` and a pure
  `resolveBookingPaymentStatus` helper (drop-in bookings resolve from
  `payments.booking_id`; plan bookings resolve from the student's current
  `subscriptions` row's linked payment, since a plan is paid at the
  subscription level, not per class).
- **Teacher color coding:** map each teacher to one of the app's existing
  `--chart-1`..`--chart-5` tokens (deterministic by name) instead of
  introducing new colors — keeps it inside the existing "decent, one accent
  per screen" palette philosophy. Applied as a left-border/dot accent on
  class chips in `MonthGrid`, `WeekGrid`, and `AgendaList`.
- **Reserved-spot accuracy:** `useClassesInRange` already filters
  `booked_count` to `reserved/confirmed/attended` bookings (cancelled
  bookings are already excluded), and the same active-status filter is used
  in the roster drawer and in the Miembros month-count query, so the three
  don't disagree today. Verify live in the browser (compare a chip's count
  against the drawer's roster for the same class) before deciding whether any
  code change is needed here — no speculative fix without a reproduced
  discrepancy.

## Out of scope
- Redesigning the mobile card list beyond the same tooltip/icon changes.
- Changing the plan/payment data model itself.
- Dark mode (site has none).
