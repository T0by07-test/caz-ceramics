# Plan: Responsiveness Rollout (Phased)

Goal: make the app fully usable from 360px phones up to 1440px+ desktops without horizontal scroll, clipped text, or broken nav. Mobile-first per the project's design system. No business-logic changes — presentation only.

Breakpoints we target (Tailwind defaults):
- `base` 360–639 (phone)
- `sm` 640–767 (large phone / small tablet)
- `md` 768–1023 (tablet)
- `lg` 1024–1279 (laptop)
- `xl` 1280+ (desktop)

---

## Phase 0 — Audit & baseline (no code changes)

1. Drive the running preview with Playwright at 360 / 414 / 768 / 1024 / 1440 widths for every top-level route (`/`, `/login`, `/signup`, `/app`, `/app/reservas`, `/app/recuperaciones`, `/app/planes`, `/app/perfil`, `/admin`, `/admin/clases`, `/admin/alumnas`, `/admin/mensajes`, `/admin/finanzas`, `/admin/registro`, `/admin/gastos`, `/admin/pagos`, `/admin/notificaciones`, `/admin/solicitudes`).
2. Capture a screenshot per route per width into `/tmp/browser/responsive/` and log any:
   - horizontal scrollbars (`document.documentElement.scrollWidth > clientWidth`)
   - clipped/overflowing text
   - overlap with the mobile bottom nav
   - off-screen action buttons / dialogs
3. Produce a short findings list grouped by component. This drives the scope of phases 1–4.

Acceptance: a written audit checklist with one row per (route × width).

---

## Phase 1 — App shells (largest containers)

Files: `src/components/layout/AppShell.tsx`, `src/routes/__root.tsx`, `src/routes/admin.tsx`, `src/routes/app.tsx`.

1. **Mobile bottom nav overflow.** `AppShell` admin variant renders 9 nav items inside `max-w-md grid-cols-${items.length}` — at 360px each cell is ~40px and labels clip. Fix:
   - Cap visible items at 4–5 on mobile; collapse the rest into a "Más" sheet (shadcn `Sheet`) triggered from a final nav cell.
   - Keep desktop sidebar unchanged (already scrollable in a 240px column).
2. **Top bar.** Apply the responsive header pattern (grid → flex at `sm:`, `min-w-0`, `truncate`, `shrink-0`) so brand text never pushes the avatar off-screen on narrow widths.
3. **Main content padding.** Verify `px-5 lg:px-8 pb-24 lg:pb-10` keeps content clear of the bottom nav on every page; adjust where pages use their own padding.
4. **Banners** (`PaymentTestModeBanner`): confirm wraps cleanly on phone widths.

Acceptance: at 360px, all nav items reachable, no horizontal scroll, no header clipping; desktop sidebar unchanged.

---

## Phase 2 — Page layouts (per-route scaffolds)

Work route by route, largest first. For each: enforce the layout pattern from the design-system guidance — `grid-cols-[minmax(0,1fr)_auto]` headers, `min-w-0`, `truncate`, `shrink-0`, stack toolbars vertically on mobile, promote to row at `sm:`/`md:`.

Order (by size and traffic):
1. `admin.alumnas.tsx` (1106 lines) — member list + detail drawer.
2. `admin.registro.tsx` (1075 lines) — ingresos register, dense table.
3. `admin.clases.tsx` (643) — calendar admin.
4. `admin.finanzas.tsx` (622) — dashboard cards/charts.
5. `admin.gastos.tsx` (529) — expense list.
6. `admin.index.tsx` (514) — admin dashboard.
7. `admin.solicitudes.tsx` (453) — requests inbox.
8. `app.reservas.tsx` (402) — student bookings.
9. `app.index.tsx`, `app.planes.tsx`, `app.recuperaciones.tsx`, `app.perfil.tsx`.
10. `admin.mensajes.tsx`, `admin.pagos.tsx`, `admin.notificaciones.tsx`.
11. Auth routes: `login.tsx`, `signup.tsx`, `solicitar.tsx`, `unirse.$token.tsx`, success pages.

For each page:
- Page header: collapse filter pills/action buttons under a toolbar that wraps on mobile.
- Multi-column grids: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` (numbers depend on content density).
- Cards: full-width on mobile, fixed/min widths only from `md:` up.

Acceptance: every page passes the Phase 0 checks at all five widths.

---

## Phase 3 — Heavy data components

1. **Tables** (`admin.registro`, `admin.pagos`, `admin.gastos`, `admin.alumnas`): on mobile (<`md`), swap `<table>` for a stacked card list of the same rows; keep table from `md:` up. Sticky table headers on `lg:`.
2. **Calendar** (`CalendarBoard`, `MonthGrid`, `WeekGrid`, `DayView`, `MobileWeekList`): already has mobile fallbacks — verify and tighten cell sizing, dot legends, header chevrons at 360px; ensure `CalendarHeader` toolbar wraps.
3. **Dialogs / Sheets / Drawers**: enforce `max-h-[90vh] overflow-auto`, full-screen on mobile via shadcn `Sheet` where dialogs currently overflow (member detail, slot editor, export dialog, voice FABs).
4. **FABs** (`VoiceFAB`, `GastosVoiceFAB`): reposition so they don't overlap mobile bottom nav (`bottom-20 lg:bottom-6`).

Acceptance: no row truncation or horizontal scroll on data-dense screens at 360px; dialogs scroll internally instead of clipping.

---

## Phase 4 — Atomic components & polish

1. Buttons with long Spanish labels: add `whitespace-normal` or shorter mobile copy where needed.
2. Form fields: full width on mobile, two-column from `sm:` for short pairs (e.g. nombre/apellido).
3. Inputs/Select/Combobox menus: confirm popovers stay within viewport (`collisionPadding`).
4. Typography: confirm `text-h1/h2/h3` clamps already work; tighten any hard-coded `text-2xl` etc.
5. Images / avatars: `shrink-0` everywhere; use `aspect-` utilities for media tiles.

Acceptance: spot-check every shadcn-derived component used in the app at 360 and 1440.

---

## Phase 5 — Cross-cutting testing

Repeat the Phase 0 Playwright sweep after each phase, not only at the end:

- Script: `/tmp/browser/responsive/sweep.py` loops the route list × widths, restores the Supabase session via `LOVABLE_BROWSER_SUPABASE_*`, screenshots each combo, and asserts no horizontal scroll.
- Manual review of screenshots after each phase; only proceed to the next phase when the previous one is clean.
- Final pass: tablet landscape (1024×768) and a tall phone (414×900) to catch vertical-only issues (sticky footers, modal heights).

---

## Technical notes

- Stack: TanStack Start + Tailwind v4 + shadcn/ui (no `tailwind.config.js`; tokens live in `src/styles.css`).
- Use only existing semantic tokens — no new colors.
- No business logic, no data-model, no server-function changes in any phase.
- `AppShell` is the only component touched by both admin and student shells; changes there must be verified against both `RouteGuard requireRole="user"` and `requireStaff` paths.

---

## Deliverable per phase

- Phase 0: audit checklist + baseline screenshots.
- Phases 1–4: code changes scoped to the files listed, plus refreshed screenshots demonstrating before/after at the affected widths.
- Phase 5: final sweep report (route × width matrix, all green).
