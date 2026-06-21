# Cazu Ceramics — Projekt-Status & Übergabe

> **Für einen neuen Chat:** „Lies `docs/PROJECT-STATUS.md`" — dann ist der volle Kontext da.
> Stand: 2026-06-21.

## Was ist das
Reservierungs-/Kurs-Management-App für ein Töpfer-Studio in Valencia (Besitzerin: **Cande**). User = Schülerinnen + Cande (Admin). Ziel: Whatsapp-Gruppen-Chaos ablösen — Schülerinnen managen Anwesenheit selbst, automatische Benachrichtigungen, Zahlungen, öffentliche Anfragen, Workshops. Ursprünglich ein Lovable-Projekt, weiterentwickelt in Claude Code.

## ⚠️ Infrastruktur & Deploy (WICHTIG — hier liegen die Stolpersteine)
- **Lovable Cloud** (managed DB auf Supabase-Basis). **Kein eigener Supabase-Account/-Dashboard.** Alles über die Lovable-UI: `Cloud → Database / Secrets / Edge functions / SQL editor / Users / Logs`, sowie `Payments` (Stripe) und `Emails (Pro)`.
- **Repo:** `github.com/T0by07-test/caz-ceramics` (Tobis **privater** Account). Push via `gh` als `T0by07-test` (NICHT der Arbeits-Account `tobiasjung-snocks` — der hat keine Rechte). Branch `main`.
- **Deploy = `git push origin main`** → Lovable synct automatisch:
  - ✅ **Frontend** (TanStack Start/Cloudflare) + **Edge Functions** deployen automatisch.
  - ❌ **DB-Migrationen laufen NICHT automatisch.** (Empirisch bestätigt.) Schema-/Daten-Änderungen müssen **manuell im Lovable SQL editor** ausgeführt werden (`Cloud → SQL editor`), oder über den Lovable-Chat.
- **Secrets** (Edge Functions): `Cloud → Secrets` (NICHT in git, nicht im Supabase-Dashboard).
- **Scheduling:** **kein pg_cron** auf Lovable Cloud → externer HTTP-Scheduler (cron-job.org/Crontap/Inngest) auf die `CRON_SECRET`-geschützten Endpoints. Die Scheduler-Migrationen sind fehlertolerant (no-op).
- **Stripe:** läuft über Lovables Connector-Gateway (`Payments`-Bereich). Preise/Bizum dort konfigurieren.
- **Sandbox-Hinweis (Claude Code):** `~/Downloads` ist für den Agent gesperrt (macOS) → Dateien zum Lesen nach `/tmp` kopieren.

## Stack
TanStack Start + React 19 + TypeScript (Vite, Cloudflare/wrangler). Supabase (Postgres + RLS + SECURITY-DEFINER-RPCs + Realtime + Auth). Stripe (embedded Checkout). Twilio WhatsApp (Code da, **inaktiv** bis Meta-Approval). Resend (E-Mail, Code da). Spanisch, Europe/Madrid. Dev-Port **8080**.

## Roadmap A–E + Status
- **A — Kern live bringen — GEBAUT & GEPUSHT.** Notification-Pipeline (WhatsApp via Twilio **Content-Templates**, E-Mail via **Resend**, `CRON_SECRET`-Härtung), Scheduler-Migrationen (no-op auf Lovable Cloud → extern), echte Stripe-Beträge im Webhook, **Check-in/Anwesenheit** (`mark_attendance`), Bugfix `notifications`-status-CHECK. Spec: `docs/superpowers/specs/2026-06-19-block-a-kern-live-bringen-design.md`. Twilio-Manual: `docs/setup/twilio-whatsapp-setup.md`.
- **B — Admin-Tools — GEBAUT & GEPUSHT.** B1 Sammelnachrichten = Composer + **Copy-Button** (`/admin/mensajes`, kein Auto-Versand — umgeht WhatsApp-Gruppen-Limit). B3 Zahlungserinnerung = Button in `/admin/alumnas` → Stripe-Link + Default-Text über die Notification-Pipeline (`payment_reminder`).
- **C v1 — Zulassungs-Onboarding (Klassen) — GEBAUT & GEPUSHT.** Öffentlich `/solicitar` (Anfrage ohne Konto) → `/admin/solicitudes` (Cande akzeptiert) → Invite-Mail (Resend) + Copy-Link → `/unirse/$token` (Konto + **automatische comp-Anmeldung**). Signup invite-only. Echte Landing + Shop-Link. **comp-only** (keine Vorab-Zahlung im Invite; Zahlung via B3). Spec: `docs/superpowers/specs/2026-06-19-block-b-c-v1-design.md`.
- **Preise + Zahlarten — GEBAUT & GEPUSHT.** Pläne 35/50/65/80 €. „Comprar plan" → Dialog **Efectivo / Tarjeta / Bizum**. Efectivo = sofort aktiv (`purchase_plan_cash`, comp), „paga en tu primera clase". Tarjeta/Bizum = Stripe.
- **Klassen — GESEEDET (via SQL editor).** Juni+Juli, **alle 2 h**, Spalten `title` + `instructor` ergänzt. Schedule: Lunes 17:00 (Clase niños/Sofi) & 18:30 (Sofi); Martes 18:30; Miércoles 10:30/15:00/18:30; Jueves 16:00/18:30; Viernes 11:00 & 17:30 (Sofi). Seed: `docs/setup/seed-classes-jun-jul.sql`.
- **Ledger / Registro — GEBAUT (Daten via SQL editor importiert).** Tabelle `ledger_entries` + Admin-Seite `/admin/registro` (Tabelle, Filter, Summen Cobrado/Pendiente, CRUD). Bildet Candes Juni-Einnahmen-Sheet 1:1 ab (Klassen, Drop-ins, Coworking, Produkte, horno, Workshops). **→ Basis für das Finance-Modul (siehe unten).** Import-SQL (PII) liegt in `/tmp/ledger-import.sql`, NICHT im Repo.
- **E — Shop — NICHT neu gebaut.** Nur Verlinkung auf `cazuceramics.com` (in der Landing). Erledigt.
- **D — Workshops — NICHT GEBAUT (offen).** Workshop-/Event-Entität (Titel/Preis/Bild/Kapazität), Wochenend-Anmeldung + **Anzahlung** (neuer Stripe-Deposit-Modus), private Workshop-Anfrage → WhatsApp an Cande (braucht A live + Admin als Notif-Empfänger). Dockt an Cs Invite-Gerüst an.

## Neue DB-Objekte (alle via SQL editor angewandt)
Tabellen: `enrollment_requests`, `enrollment_request_classes`, `invites`, `invite_classes`, `ledger_entries`. Spalten: `bookings.source` += `'comp'`; `classes` += `title`, `instructor`; `payments` += `method`. RPCs: `mark_attendance`, `create_enrollment_request`, `redeem_invite`, `accept_enrollment_request`, `enroll_from_invite`, `purchase_plan_cash`, `payment_reminder`-Template in `process-notifications`. Anon-SELECT auf scheduled `classes`. Notification-status-CHECK erweitert.

## Método-Codes (Ledger)
**T = Tarjeta · E = Efectivo · B = Bizum · R = Revolut.** Status: Pagado / Pendiente / ausente.

## NOCH OFFEN (für echtes Go-live, kein Code)
- **Lovable Secrets setzen:** `RESEND_API_KEY` + Domain `cazuceramics.com`, `APP_BASE_URL`, `CRON_SECRET`; später Twilio (`TWILIO_ACCOUNT_SID/API_KEY_SID/API_KEY_SECRET/WHATSAPP_FROM` + 8 `TWILIO_TEMPLATE_*` ContentSids + `TWILIO_TEMPLATE_PAYMENT_REMINDER`).
- **Stripe:** Produkte/Preise mit Lookup-Keys `plan_1..4_class_month` + `drop_in_class_single` (50/65/80/35 €), **Bizum aktivieren**, Webhook auf deployte Function-URL.
- **Twilio/Meta WhatsApp-Onboarding** (Wochen Vorlauf) — siehe Manual.
- **Externer Scheduler** für `process-notifications` (jede Min) + auto-cancel/reminders.
- **E-Mail-Bestätigung in Lovable/Supabase prüfen → AUS** (sonst kann `/unirse` nicht sofort einbuchen).

## NICHT gebaute Frontend-Punkte (für später)
- Admin-Klassen-Formular für **variable Dauer/Kapazität/Lehrer/Titel** (Klassen werden bisher per SQL angelegt; das Formular ist noch das alte).
- **Anzeige** von `title`/`instructor` in Kalender/Admin (Spalten existieren, werden noch nicht angezeigt — außer im Registro).
- B3 für Custom-Beträge (v1 nur Plan). Makeup-Redemption als transaktionale RPC (heute client-seitig).

## 💰 FINANCE-MODUL (nächster, separater Chat) — Kickoff
**Ziel:** Cande managt ihre Finanzen im Admin-Panel. **Basis ist bereits da:** die `ledger_entries`-Tabelle + `/admin/registro` (Candes Sheet digital, editierbar).
Ausbau-Ideen für den neuen Chat:
- **Einnahmen** (vorhanden) + **Ausgaben/Gastos** ergänzen (Material, Miete, horno-Strom …) → echtes Plus/Minus.
- **Monats-/Zeitraum-Reports**, Aufschlüsselung nach Kategorie & Methode, Dashboard mit Charts (recharts ist im Stack).
- **Verknüpfung** mit `payments` (Stripe) + den Abo-/Buchungs-Daten, damit Online-Zahlungen automatisch im Ledger landen (statt manuell).
- Export (CSV/PDF), offene Posten (Pendiente) als Mahnliste (→ B3-Zahlungserinnerung).
- Klären: bleibt das Ledger ein freies Journal, oder strukturierter (eigene `expenses`-Tabelle, Kategorien-Stammdaten)?

**Datenlage:** Juni-Ledger ist importiert (64 Einträge, „Pagado"-Summe 3.910,00 €).

## Spec-/Setup-Dateien
- `docs/superpowers/specs/2026-06-19-block-a-kern-live-bringen-design.md`
- `docs/superpowers/specs/2026-06-19-block-b-c-v1-design.md`
- `docs/setup/twilio-whatsapp-setup.md`
- `docs/setup/seed-classes-jun-jul.sql`, `docs/setup/apply-to-lovable-cloud.sql`
- `/tmp/ledger-import.sql` (PII, nicht im Repo)
