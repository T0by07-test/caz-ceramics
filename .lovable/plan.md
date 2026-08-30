# Plan: Add project knowledge text

Create a single "Knowledge" text block for Lovable project settings that gives any new chat/agent the current, accurate picture of the project. It supersedes the outdated project instructions (which still describe credits, plan purchases, 3h rule, and old prices). The text below is the exact content to deliver — review and approve, then it's handed over for pasting into Knowledge (and optionally synced into project docs).

---

```markdown
# Cazú Ceramics — reservas.cazuceramics.com

## What this is
Booking & class-management app for a small pottery studio in Valencia (Ruzafa).
Owner: Cande (admin). Users: students ("alumnas"). It replaces WhatsApp-group
scheduling: students self-manage bookings, payments, cancellations and make-ups;
public visitors can view the schedule and book a trial class.

## Stack
- TanStack Start + React 19 + TypeScript (Vite, Cloudflare Workers target)
- Tailwind CSS v4 + shadcn/ui + Lucide icons
- Lovable Cloud (managed Supabase: Postgres + RLS + SECURITY DEFINER RPCs + Auth + Edge Functions + Realtime)
- Stripe via the Lovable Payments connector (sandbox keys configured)
- Transactional email from noreply@cazuceramics.com (notify.cazuceramics.com, SPF/DKIM/DMARC verified)
- All user-facing UI in Spanish (es-ES); all code, identifiers, table/function names in English
- Timezone Europe/Madrid; currency EUR in cents; dev port 8080

## Routes
- `/` — landing with public Google-Calendar-style monthly schedule, tiered pricing, info flow with class picking + Stripe trial payment (35 €)
- `/solicitar` — public enrollment request (no account) → `/admin/solicitudes` (Cande accepts) → invite email → `/unirse/$token` (account creation + auto-enrollment)
- `/signup`, `/login` — self sign-up enabled; `/forgot-password`, `/reset-password`
- `/app` — student area: monthly calendar with multi-select, dynamic price, payment-method dialog before confirming
- `/admin/*` — clases, alumnas, pagos, solicitudes, registro (income ledger + Sofi commission), finanzas, gastos, mensajes, notificaciones

## Business rules (CURRENT — overrides older docs/specs)
- NO credit/subscription system. Students select classes in the monthly calendar and pay for what they pick.
- Dynamic pricing (src/lib/pricing.ts): adults 1 clase = 30 €, 2 = 55 €, 3 = 70 €, 4 = 85 €, each extra adult class +20 €. Kids class (Monday 17:00, 1 h) = 12 € each, priced per class. Trial class = 35 €, adults only.
- Payment method (Card / Bizum / Cash) MUST be chosen before a booking is created — bookings never auto-confirm. Bizum number 627 093 463 is shown inside the Stripe checkout dialog only.
- Capacity: 6 ideal, 7 max. Waitlist is FIFO with auto-promotion on cancellation.
- Cancellation window: >12 h before class start = recoverable ("clase a recuperar"); <12 h = lost.
- Studio closure: no classes 28/09/2026–04/10/2026 (selection blocked via src/lib/closures.ts).
- Teachers: Sofi teaches Mon 17:00 (kids), Mon 18:30 and Fri 17:30; Cande teaches the rest. Sofi's commission is 65 % — shown in `/admin/registro` ("Reparto de ingresos").
- The public calendar shows real occupancy via the `public_class_availability` RPC (same data as admin); full classes can't be selected.
- Stripe-paid enrollment requests are auto-accepted (public.accept_paid_enrollment_request + webhook).
- Payments in any method (Stripe, Bizum, cash) are auto-recorded into `ledger_entries` (the `/admin/registro` journal).
- Auth emails are Spanish, sent from the verified domain notify.cazuceramics.com (templates in src/lib/email-templates/).

## Deploy & infra gotchas
- Deploy = `git push origin main` (github.com/T0by07-test/caz-ceramics). Frontend + Edge Functions deploy automatically; DB migrations do NOT auto-run — apply schema/data changes manually via the Lovable SQL editor.
- No pg_cron on Lovable Cloud: use an external scheduler (e.g. cron-job.org) hitting the CRON_SECRET-protected endpoints (`/api/public/hooks/*`, `process-notifications` every minute).
- Reservations send a Spanish confirmation email listing each booked class (date, time, teacher) via process-notifications.

## Security posture (intentional)
- Students never write tables directly: bookings/payments/makeups/etc. are mutated only through validated SECURITY DEFINER RPCs; no student INSERT/UPDATE policies exist on those tables (fail-closed by design).
- Staff helpers `is_admin()`, `is_staff()`, `can_manage_classes()` are NOT executable by anon; staff policies are scoped to `authenticated`.
- Anonymous read access is limited to scheduled classes from today onward (Europe/Madrid); no student PII is public.
- CRON_SECRET is required on all scheduler endpoints.

## Out of scope
Multi-studio support, Google Calendar sync, native apps, refunds (cancellations grant make-ups, never refunds), recurring Stripe subscriptions, public browsing of past classes.
```

---

## Steps
1. Deliver the knowledge text above as a chat attachment for pasting into Lovable Knowledge.
2. Optionally refresh `docs/PROJECT-STATUS.md` pointers so docs match (only if requested).
