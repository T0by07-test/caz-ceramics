# Block A — „Kern live bringen" (Design / Spec)

- **Datum:** 2026-06-19
- **Status:** Entwurf zur Review
- **Projekt:** Cazu Ceramics (Töpfer-Studio Valencia, Lovable + Supabase + Stripe)
- **Repo:** `T0by07-test/caz-ceramics` · Branch `main` · Supabase-Projekt `gqucwldwbfjfxrqwvpqj`

> Sprache: Prosa Deutsch, alle Bezeichner/Code Englisch (gemäß Arbeitsweise).

---

## 1. Kontext & Ziel

Die App ist heute eine voll funktionierende Mitglieds-/Buchungs-App für **bestehende** Schülerinnen (Kalender, Buchen per Plan-Guthaben oder Drop-in mit Stripe, Warteliste mit Nachrücken, Stornieren mit 3h-Regel, Recuperaciones, Planverkauf, komplettes Admin-Backend). Das Fundament ist echt verdrahtet und sauber gebaut (Postgres + RLS + atomare RPCs + signaturgeprüfter Stripe-Webhook).

**Block A macht diesen bestehenden Kern produktionsreif.** Konkret:

- Zahlungen laufen mit **echten** Stripe-Preisen (statt Platzhaltern + `amount_cents=0`).
- Zeitgesteuerte Jobs (Auto-Cancel, 24h-Reminder, Monats-Summary) **feuern** über einen Scheduler.
- **Anwesenheit** kann erfasst werden (Check-in).
- Der **Benachrichtigungs-Versand** ist fertig verdrahtet (E-Mail-Stub ersetzt, WhatsApp auf genehmigte Templates umgebaut), sodass am Tag der WhatsApp-Genehmigung **ein Schalter** (Secrets setzen) genügt.

### Strategische Rahmenentscheidungen (bereits getroffen)

1. **WhatsApp-first beim Launch**, kein E-Mail-Interim. Der *Launch* von Block A ist an die Meta/WhatsApp-Genehmigung gekoppelt.
2. **Parallel bauen:** WhatsApp-Onboarding (Bürokratie, lange Leitung) läuft parallel zur Code-Arbeit. Code ist fertig, wenn die Genehmigung kommt.
3. **Deploy über Lovable/GitHub:** Code fährt per `git push` → `main` → Lovable/Supabase-Pipeline. Secrets, Stripe-Produkte, Extensions und Twilio/Meta-Onboarding sind **separate Dashboard-Schritte** (siehe Runbook §7).

---

## 2. Scope

### In Block A
- **A1** — WhatsApp-Versand auf Twilio Content-Templates umbauen + 8 Templates definieren + E-Mail-Stub durch echten Lovable-Email-Versand ersetzen + Status-CHECK-Bugfix.
- **A2** — Scheduler (`pg_cron` + `pg_net`) für Versand-Worker, Auto-Cancel, 24h-Reminder, Monats-Summary + Härtung der offenen Endpoints.
- **A3** — Echte Stripe-Produkte/Preise (Lookup-Keys) + echten Betrag im Webhook aufzeichnen.
- **A4** — Check-in / Anwesenheit (`mark_attendance` RPC + Admin-UI in `/admin/clases`).

### Bewusst NICHT in Block A (bekannte Issues → spätere Blöcke)
- Makeup-Redemption serverseitig als RPC (heute Client-seitiges `makeups.used_booking_id`-Update). Robustheits-Issue, kein Blocker → eigener kleiner Fix-Block.
- No-Show mit Konsequenzen (Guthaben-Verfall etc.). Default in A4: **nur erfassen**.
- WhatsApp-Sammelnachrichten, Anmeldelinks, Zahlungserinnerungen (= Block B).
- Öffentlicher Funnel, Workshops, Shop (= Blöcke C/D/E).

---

## 3. Architektur-Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| AD-1 | WhatsApp via **Twilio Content-Templates** (`ContentSid` + `ContentVariables`) statt freiem `Body` | Meta erlaubt für business-initiierte Nachrichten nur genehmigte Templates. Accounts nach Juli 2024 müssen den Content Template Builder nutzen. |
| AD-2 | Mapping `notification.type → ContentSid` über **Edge-Function-Secrets** (1 Secret pro Template-Typ) | Keine Geheimnisse/IDs in git; einfach pro Umgebung setzbar. Bei Wachstum später optional in eine `message_templates`-Tabelle. |
| AD-3 | Scheduler = **`pg_cron` + `pg_net`** (Postgres ruft Edge-Functions per HTTP) | Supabase-Standard. `process-notifications` & `auto-cancel-classes` sind HTTP-Endpoints; SQL-Cron muss sie via `net.http_post` aufrufen. |
| AD-4 | Offene Endpoints mit **`CRON_SECRET`-Header** absichern | `process-notifications` & `auto-cancel-classes` sind aktuell unauthentifiziert; auto-cancel ruft eine service-role-RPC. |
| AD-5 | Stripe über **Lookup-Keys** (Function löst Preise schon so auf) | Minimaler Code-Eingriff: echte Prices in Stripe mit den erwarteten Keys anlegen, statt Code umzubauen. |
| AD-6 | Check-in als **`mark_attendance(p_booking_id, p_status)`** RPC (nur Admin) | Konsistent mit dem bestehenden RPC-/RLS-Muster; Business-Logik bleibt in der DB. |

---

## 4. Workstreams im Detail

### A1 — Benachrichtigungs-Versand fertig verdrahten

**Datei:** `supabase/functions/process-notifications/index.ts`

**A1.1 — WhatsApp auf Templates umbauen.**
`sendWhatsApp()` postet heute an `…/Messages.json` mit `Body: rendered.text`. Umbau:
- Neue Env-Lookups: `TWILIO_TEMPLATE_<TYPE>` (ContentSid je Typ) — siehe Mapping unten.
- Statt `Body` → `ContentSid` + `ContentVariables` (JSON der nummerierten Variablen `{{1}}…`).
- `From` bleibt `whatsapp:${TWILIO_WHATSAPP_FROM}` (alternativ später Messaging Service SID).
- Fehlt der ContentSid für einen Typ → Row als `failed` mit `template_not_configured:<type>` markieren (kein stiller Skip).

**A1.2 — E-Mail-Stub ersetzen.**
`sendEmail()` gibt aktuell immer `{skipped}` zurück. Ersetzen durch echten Versand (Lovable Email via `LOVABLE_API_KEY` + verifizierte Absender-Domain `cazuceramics.com`). HTML-Template (`wrap()`) existiert bereits. **Hinweis:** Auch wenn der Launch WhatsApp-first ist, machen wir den E-Mail-Pfad funktionsfähig — `notification_preference='both'` ist Default, und E-Mail ist ein kostenloser Fallback/Audit-Kanal.

**A1.3 — Status-CHECK-Bugfix (Migration).**
`claim_notifications` setzt `status='sending'`, aber der CHECK erlaubt nur `('queued','sent','failed')`. Neue Migration:
```sql
alter table public.notifications drop constraint if exists notifications_status_check;
alter table public.notifications add constraint notifications_status_check
  check (status in ('queued','sending','sent','failed'));
```

**A1.4 — Die Templates (8 Stück).**
Basis = die bereits im Code vorhandenen ES-Texte, parametrisiert. Kategorie **UTILITY** (transaktional, günstiger, leichter genehmigt) außer wo markiert.

| Template-Key (Env) | Typ | Variablen | Kategorie |
|---|---|---|---|
| `TWILIO_TEMPLATE_RESERVATION_CONFIRMED` | `reservation_confirmed` | {{1}}=Name | UTILITY |
| `TWILIO_TEMPLATE_PLAN_PURCHASED` | `plan_purchased` | {{1}}=Name | UTILITY |
| `TWILIO_TEMPLATE_REMINDER_24H` | `reminder_24h` | {{1}}=Name, {{2}}=Datum, {{3}}=Start, {{4}}=Ende | UTILITY |
| `TWILIO_TEMPLATE_CLASS_CANCELLED` | `class_cancelled` | {{1}}=Name | UTILITY |
| `TWILIO_TEMPLATE_MAKEUP_AVAILABLE` | `makeup_available` | {{1}}=Name | UTILITY |
| `TWILIO_TEMPLATE_WAITLIST_PROMOTED_PLAN` | `waitlist_promoted` (ohne Zahlung) | {{1}}=Name | UTILITY |
| `TWILIO_TEMPLATE_WAITLIST_PROMOTED_PAY` | `waitlist_promoted` (mit Zahlung) | {{1}}=Name | UTILITY |
| `TWILIO_TEMPLATE_MONTHLY_SUMMARY` | `monthly_summary` | {{1}}=Name, {{2}}=genutzt, {{3}}=gesamt, {{4}}=Rest, {{5}}=Recups | **MARKETING?** ⚠️ |

⚠️ `monthly_summary` kann von Meta als MARKETING eingestuft werden → braucht Marketing-Opt-in. Mit Cande klären; im Zweifel als UTILITY-Resumé formulieren oder vorerst weglassen.

Die fertigen ES-Texte (mit `{{n}}`-Platzhaltern) liegen im Twilio-Manual (`docs/setup/twilio-whatsapp-setup.md`) zum 1:1-Einfügen in den Content Template Builder.

---

### A2 — Scheduler & Endpoint-Härtung

**A2.1 — Extensions** (Migration, idempotent):
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```
*(Ggf. vorab im Supabase-Dashboard unter Database → Extensions aktivieren — siehe Runbook.)*

**A2.2 — Cron-Jobs** (Migration, `cron.schedule` + `net.http_post`). Bestehend bleibt: `expire-pending-drop-ins` (alle 5 min). Neu:

| Job | Takt (Europe/Madrid beachten) | Ruft auf |
|---|---|---|
| `process-notifications` | jede Minute | Edge-Function `process-notifications` (HTTP POST, `CRON_SECRET`-Header) |
| `enqueue-24h-reminders` | stündlich | SQL-RPC `enqueue_24h_reminders()` |
| `enqueue-monthly-summary` | monatlich (1. um 08:00) | SQL-RPC `enqueue_monthly_summary()` |
| `auto-cancel-classes` | täglich (Default 08:00) — **mit Cande bestätigen** | App-Hook `/api/public/hooks/auto-cancel-classes` (HTTP POST, `CRON_SECRET`) |

> Hinweis: `pg_cron` rechnet i.d.R. in UTC. Takte entsprechend umrechnen (Madrid = UTC+1/+2 mit DST).

**A2.3 — Endpoint-Härtung.** `process-notifications` (Edge) und `auto-cancel-classes` (App-Route) prüfen einen `CRON_SECRET`-Header und antworten sonst `401`. Secret als Env-Var + im `net.http_post`-Header.

---

### A3 — Echte Stripe-Preise

**A3.1 — Stripe-Produkte/Preise** (Dashboard, kein git). 5 Prices mit Lookup-Keys, die die Function erwartet:
- Pläne: `plan_1_class_month`, `plan_2_class_month`, `plan_3_class_month`, `plan_4_class_month`
- Drop-in: `drop_in_class_single`

**A3.2 — `plans`-Daten** (Migration/Seed-Update): `plans.stripe_price_id` mit den realen Lookup-Keys/Price-IDs konsistent halten; Preise (heute 35/65/90/110 €) **mit Cande bestätigen** (§6).

**A3.3 — Echten Betrag aufzeichnen.** `payments-webhook` schreibt bei `confirm_drop_in_booking` / `grant_plan_subscription` den **tatsächlichen** `amount_total` aus der Stripe-Session in `payments.amount_cents` (statt `0`). Ggf. RPC-Signaturen um `p_amount_cents` erweitern.

**A3.4 — Test → Live.** Erst im Test-Modus durchspielen (Banner `PaymentTestModeBanner` ist vorhanden), dann Live-Keys + Live-Prices. Webhook-Endpoint in Stripe muss auf die **deployte** Function-URL zeigen.

---

### A4 — Check-in / Anwesenheit

**A4.1 — RPC** (Migration):
```sql
-- mark_attendance(p_booking_id uuid, p_status text)  -- 'attended' | 'reserved' (toggle/undo)
-- SECURITY DEFINER, nur is_admin(); setzt bookings.status; schreibt admin_actions-Audit.
```
Default-Scope: nur `attended` setzen/zurücknehmen. Kein eigener `no_show`-Status in Block A (Default „nur erfassen", §6 Frage 2).

**A4.2 — Admin-UI.** In `/admin/clases` Klassen-Detailansicht: Teilnehmerinnen-Liste mit „anwesend"-Toggle pro Buchung → `mark_attendance`. Realtime-Refresh wie bei den bestehenden Admin-Views.

---

## 5. Daten-/Code-Änderungen (Übersicht)

**Neue Migrationen** (fahren per git → Lovable/Supabase):
1. `notifications_status_check` um `'sending'` erweitern (A1.3).
2. `create extension pg_cron, pg_net` (A2.1).
3. `cron.schedule`-Jobs + `net.http_post`-Wrapper (A2.2).
4. `mark_attendance`-RPC + Grants (A4.1).
5. Stripe-`plans`-Daten-Reconcile (A3.2) + ggf. RPC-Erweiterung für `amount_cents` (A3.3).

**Edge-Function-Änderungen:**
- `process-notifications/index.ts`: `sendWhatsApp` → Content-Templates; `sendEmail` → echter Versand; `CRON_SECRET`-Check (A1.1/A1.2/A2.3).
- `payments-webhook/index.ts`: echten Betrag aufzeichnen (A3.3).

**App-Route:**
- `src/routes/api/public/hooks/auto-cancel-classes.ts`: `CRON_SECRET`-Check (A2.3).

**Frontend:**
- `/admin/clases` Klassen-Detail: Anwesenheits-Toggle (A4.2).

---

## 6. Offene Business-Fragen (mit Cande, blockieren den Code nicht)

1. **Plan-Preise** — sind 35 / 65 / 90 / 110 € korrekt? Und der Drop-in-Preis?
2. **No-Show** — nur erfassen (Default) oder mit Konsequenz (Verfall etc.)?
3. **Template-Texte/Ton** — Entwürfe liegen im Manual; Freigabe durch Cande.
4. **`monthly_summary`** — gewünscht? Falls ja, UTILITY- vs MARKETING-Einstufung klären (Opt-in).
5. **Absender-Domain E-Mail** — `noreply@cazuceramics.com` o.ä.; DNS-Verifizierung nötig.

---

## 7. Deployment-Runbook (Reihenfolge!)

**Fährt per `git push` (Code):** alle Migrationen, Edge-Function-Änderungen, App-Route, Frontend.
**Manuelle Dashboard-Schritte (nicht in git):**

1. **Supabase Extensions** `pg_cron` + `pg_net` aktivieren (Database → Extensions) — **bevor** die Cron-Migration läuft.
2. **Erste Migration verifizieren:** Nach erstem Push im Supabase-Dashboard prüfen, dass die Migration wirklich *ausgeführt* wurde (nicht nur die Datei synct).
3. **Secrets setzen** (Supabase → Edge Function Secrets):
   - `CRON_SECRET` (selbst generiert)
   - `LOVABLE_API_KEY` (für E-Mail) + Domain verifizieren
   - Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_WHATSAPP_FROM`
   - `TWILIO_TEMPLATE_*` (8 ContentSids — erst nach Template-Genehmigung)
4. **Stripe:** Produkte/Prices mit Lookup-Keys anlegen; Webhook-Endpoint auf deployte Function-URL zeigen lassen; erst Test-, dann Live-Keys.
5. **Twilio/Meta-Onboarding** (lange Leitung, sofort starten) → siehe `docs/setup/twilio-whatsapp-setup.md`.
6. **Go-live-Schalter:** Wenn WhatsApp-Sender + alle 8 Templates genehmigt → `TWILIO_TEMPLATE_*` + Twilio-Keys setzen → Versand ist live.

---

## 8. Definition of Done

- [ ] Eine per git gepushte Test-Migration ist nachweislich auf Supabase ausgeführt worden.
- [ ] `pg_cron`-Jobs laufen; `process-notifications` leert die Queue (im Test gegen WhatsApp-Sandbox verifiziert).
- [ ] `claim_notifications` läuft ohne CHECK-Verletzung.
- [ ] Drop-in- und Plan-Kauf erzeugen `payments`-Rows mit **echtem** `amount_cents`; Stripe-Webhook bestätigt korrekt (Test-Modus).
- [ ] Admin kann Anwesenheit pro Buchung markieren; `bookings.status='attended'` wird gesetzt + Audit geschrieben.
- [ ] WhatsApp-Code sendet via ContentSid (gegen Sandbox verifiziert); E-Mail-Versand funktioniert gegen verifizierte Domain.
- [ ] Endpoints `process-notifications` & `auto-cancel-classes` weisen Aufrufe ohne `CRON_SECRET` ab.

---

## 9. Risiken

- **R1 — GitHub→Supabase-Migrationen:** Unklar, ob Lovable per GitHub gepushte Migrationen automatisch *ausführt*. → Mitigation: erste Migration klein, sofort verifizieren (Runbook §7.2).
- **R2 — WhatsApp-Genehmigung dauert/scheitert:** Lange Leitung, Meta-Business-Verifizierung nötig. → Mitigation: sofort starten; Code via Sandbox testbar, unabhängig vom Approval.
- **R3 — Trial-Account-Limits:** Twilio-Trial sendet nur an verifizierte Nummern + Sandbox. → Produktion braucht Account-Upgrade (Guthaben). Im Manual erklärt.
- **R4 — Cron-Zeitzonen:** `pg_cron` in UTC vs. Madrid-Logik. → Takte sorgfältig umrechnen (DST).
- **R5 — Stripe Live-Umstellung:** Webhook-URL + Live-Keys leicht zu vergessen. → Runbook-Checkliste.
