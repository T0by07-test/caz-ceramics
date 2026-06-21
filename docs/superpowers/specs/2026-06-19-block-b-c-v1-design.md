# Block B + C v1 — Admin-Tools + Zulassungs-Onboarding (Klassen)

- **Datum:** 2026-06-19
- **Status:** Freigegeben (comp-only) — in Umsetzung
- **Voraussetzung:** Block A (Notification-Pipeline + Stripe + Resend-Versand werden mitbenutzt)

> Prosa Deutsch, Code/Bezeichner Englisch. DB-Tabellen/Spalten Englisch (wie Bestand), Routen/UI Spanisch.

---

## 1. Scope

### In v1
- **B1 Sammelnachrichten:** Composer im Admin-Dashboard, Freitext, **Copy-Button** (Cande postet selbst in ihre WhatsApp-Gruppe). Kein Auto-Versand.
- **B3 Zahlungserinnerung:** Button pro Schülerin → Stripe-Zahlungslink + Standardtext über die bestehende Notification-Pipeline.
- **C (Klassen):** Öffentliches Anfrage-Formular → Admin-Review → Akzeptieren → Invite-Link → Konto-Anlage → **automatische comp-Anmeldung**. Offener Signup wird invite-only.
- **Landing-Page** mit echtem Inhalt **+ Shop-Link** (→ bestehender WooCommerce-Shop).

### NICHT in v1 (= Block D, direkt danach)
- Workshops (eigene Entität) + Anzahlung/Deposit. Das Anfrage-/Invite-Gerüst wird so gebaut, dass Workshops später andocken.
- Bezahl-im-Invite-Pfad (per Entscheidung weggelassen — siehe D-1).
- B3 für beliebige Custom-Beträge (v1: knüpft an einen Plan).

---

## 2. Entscheidungen (getroffen)

| # | Entscheidung |
|---|---|
| D-1 | **Comp-only:** Akzeptieren bucht die freigegebenen Klassen IMMER als `comp` ein (kein Vorab-Zahlung im Invite). Zahlung läuft ausschließlich über die **B3-Erinnerung**. |
| D-2 | **B1 = Copy-Paste-Composer**, kein automatischer WhatsApp-Versand (umgeht Metas Freitext-Sperre). |
| D-3 | **C v1 nur Klassen**, Workshops als Block D direkt danach. |
| D-4 | **Invite-Zustellung primär per E-Mail** (Resend) **+ Copy-Button** für manuelles WhatsApp. |

---

## 3. Datenmodell (neue Tabellen)

**`enrollment_requests`** — Anfrage einer Interessentin (ohne Konto)
- `id uuid pk`, `name`, `surname`, `email`, `whatsapp`, `message text`
- `status text check (status in ('pending','accepted','rejected','cancelled')) default 'pending'`
- `created_at`, `reviewed_at timestamptz`, `reviewed_by uuid`
- RLS: **INSERT via SECURITY-DEFINER-RPC für anon** (öffentliches Formular, kein direkter Tabellen-Insert); SELECT/UPDATE nur `is_admin()`.

**`enrollment_request_classes`** — angefragte Klassen je Anfrage
- `request_id fk`, `class_id fk`, `granted bool default false`

**`invites`** — Einladungs-Token (= Zulassungs-Mechanismus)
- `id uuid pk`, `token text unique` (zufällig, URL-safe)
- `name`, `surname`, `email`, `whatsapp`, `request_id fk nullable`
- `status text check (status in ('pending','accepted','expired','revoked')) default 'pending'`
- `expires_at timestamptz` (default +14 Tage), `created_at`, `accepted_at`, `profile_id uuid` (gesetzt bei Einlösung), `created_by uuid`

**`invite_classes`** — Klassen, in die der Invite automatisch einbucht
- `invite_id fk`, `class_id fk`

**Änderung Bestand:** `bookings.source` CHECK um **`'comp'`** erweitern (gratis vorab eingebuchte Invite-Anmeldungen).

---

## 4. RPCs & Edge Functions

**RPCs (SECURITY DEFINER):**
- `create_enrollment_request(p_name, p_surname, p_email, p_whatsapp, p_message, p_class_ids uuid[])` — **anon-aufrufbar**. Validiert (Pflichtfelder, ≥1 Klasse, max-Limit), legt Request + request_classes an, gibt request id zurück.
- `redeem_invite(p_token text)` — gibt Invite-Status + freigegebene Klassen (mit Datum/Zeit) als JSON zurück; prüft pending + nicht abgelaufen. Für die Invite-Seite.
- `accept_enrollment_request(p_request_id uuid, p_granted_class_ids uuid[])` — **admin only**. Request→accepted, setzt granted-Flags, erzeugt `invites` + `invite_classes`, gibt `token` zurück. (Kein payment_mode — comp-only.)
- `enroll_from_invite(p_token text)` — nutzt `auth.uid()` als Profil; prüft Token (pending, nicht abgelaufen); legt für jede `invite_classes` eine Buchung **`status='confirmed', source='comp'`** an (admin-vorab-freigegeben → keine Capacity-/Credit-Prüfung); setzt invite `accepted` + `profile_id`. Idempotent (kein Doppel-Buchen).

**Edge Functions (neu, Deno; Eintrag in `supabase/config.toml`, `verify_jwt=true`):**
- **`accept-request`** — Input `{ request_id, granted_class_ids[] }` (Admin-JWT, prüft is_admin serverseitig). Ruft `accept_enrollment_request`, **sendet Invite-E-Mail via Resend** mit Link `${APP_BASE_URL}/unirse/<token>`, gibt `{ invite_url, token }` zurück (für Copy-Button).
- **`send-payment-reminder`** — Input `{ student_id, plan_id }` (Admin-JWT). Erzeugt einen **Stripe-Plan-Checkout-Link** (Reuse `_shared/stripe` + create-checkout-Logik, purpose 'plan') und ruft `enqueue_notification(student, 'payment_reminder', { payment_url, plan_name, amount_cents })`. Gibt `{ ok }` zurück.

**Erweiterung `process-notifications/index.ts`:** neuer Typ `payment_reminder` in `render()` (ES-Text + HTML, nutzt `payload.payment_url`), in `resolveContentSid` (`TWILIO_TEMPLATE_PAYMENT_REMINDER`) und `buildContentVariables` ({1:name, 2:amount, 3:payment_url}). E-Mail jetzt, WhatsApp sobald A live + Template genehmigt.

---

## 5. Flow

**Anfrage → Zulassung → Anmeldung (Klassen):**
1. Interessentin öffnet **/solicitar** (öffentlich) → wählt Klassen aus dem Kalender + Kontaktdaten + Nachricht → `create_enrollment_request`.
2. Cande unter **/admin/solicitudes** → Detail → hakt freigegebene Klassen an → **„Akzeptieren"** ruft `accept-request`.
3. System erzeugt Invite, **sendet Invite-E-Mail** (Resend) mit Link **/unirse/$token**; Cande sieht den Link zusätzlich mit **Copy-Button** (manuell per WhatsApp möglich). Ablehnen → status `rejected`.
4. Interessentin öffnet **/unirse/$token** → `redeem_invite` zeigt freigegebene Klassen → legt Konto an (`auth.signUp`, Name/WhatsApp aus Invite vorbefüllt, Token in Metadata).
5. Nach Konto-Anlage ruft die Seite `enroll_from_invite(token)` → Buchungen **confirmed, source='comp'** → sie ist drin. Cande kann später per **B3** an die Zahlung erinnern.
6. **Signup invite-only:** `/signup` (offen) entfällt → wird zu Hinweis/Weiterleitung auf **/solicitar**. Landing-CTA „Anmelden" → /solicitar, „Einloggen" → /login.

**B1 Sammelnachricht:** **/admin/mensajes** → Composer (Freitext, optional Bausteine) → **„Copy"** → in WhatsApp-Gruppe einfügen. (Reines Frontend.)

**B3 Zahlungserinnerung:** **/admin/alumnas** pro Schülerin Button „Erinnerung senden" → Plan wählen → `send-payment-reminder` → Stripe-Link + Standardtext (E-Mail jetzt, WhatsApp später).

---

## 6. Frontend (neu/geändert)

| Route/Datei | Was |
|---|---|
| `src/routes/index.tsx` (edit) | Echte Landing: Hero, „so funktioniert's", Preise, **Shop-Link** (neuer Tab), CTA → /solicitar |
| `src/routes/solicitar.tsx` (neu) | Öffentliches Anfrage-Formular (Kalender-Auswahl + Kontakt) |
| `src/routes/unirse.$token.tsx` (neu) | Invite-Einlösung + Konto-Anlage + Auto-Enroll (comp) |
| `src/routes/admin.solicitudes.tsx` (neu) | Review-Liste + Detail + Akzeptieren/Ablehnen + Copy-Invite-Link |
| `src/routes/admin.mensajes.tsx` (neu) | B1-Composer + Copy |
| `src/routes/admin.alumnas.tsx` (edit) | B3-Button „Erinnerung senden" pro Schülerin |
| `src/routes/signup.tsx` (edit) | invite-only (kein Token → Weiterleitung /solicitar) |
| `src/routes/admin.tsx` (edit) | Nav: „Solicitudes" + „Mensajes" |

---

## 7. Migrationen (per git → Lovable/Supabase)
1. `enrollment_requests` + `enrollment_request_classes` (+ RLS).
2. `invites` + `invite_classes` (+ RLS).
3. `bookings.source` CHECK um `'comp'`.
4. RPCs: `create_enrollment_request`, `redeem_invite`, `accept_enrollment_request`, `enroll_from_invite` (+ Grants: anon für create_enrollment_request/redeem_invite, authenticated für enroll_from_invite).

`supabase/config.toml`: Einträge `accept-request` + `send-payment-reminder`.

---

## 8. Offene Punkte (im Review klären — blockieren nicht)
1. **B3-Betrag:** v1 knüpft an einen **Plan**. Custom-Beträge später. OK?
2. **Invite-Gültigkeit:** Default 14 Tage. Passt?
3. **Anfrage ohne konkrete Klasse?** v1 verlangt ≥1 Klasse. Auch „allgemeines Interesse" zulassen?
4. **Standardtexte** (Invite-E-Mail, Zahlungserinnerung, Ablehnung) — ES-Entwürfe von mir, Cande gibt frei.

---

## 9. Deployment (wie Block A)
- Code per git → Lovable/Supabase (Migrationen + neue Edge Functions).
- Manuell: **`RESEND_API_KEY` + Domain `cazuceramics.com` (jetzt schon nötig** — Invite-E-Mails), `APP_BASE_URL` (Edge-Function-Secret für den Invite-Link), Stripe-Produkte (aus Block A), später `TWILIO_TEMPLATE_PAYMENT_REMINDER`.

## 10. Definition of Done
- [ ] Öffentliche Anfrage ohne Konto anlegbar; erscheint in /admin/solicitudes.
- [ ] Cande akzeptiert mit Klassenauswahl; Invite-E-Mail kommt an; Copy-Link funktioniert.
- [ ] Invite-Link: Konto-Anlage → sofort als `comp` confirmed eingebucht.
- [ ] Offener Signup ohne Token nicht mehr möglich.
- [ ] B1: Text kopierbar. B3: Erinnerung mit Stripe-Link wird (per E-Mail) versendet.
- [ ] Landing zeigt Inhalt + funktionierenden Shop-Link.
- [ ] `tsc --noEmit` sauber; Route-Tree regeneriert; Migrationen laufen.

## 11. Risiken
- **R1** Invite-E-Mail braucht Resend-Domain — ohne die geht C nicht live (einziger zuverlässiger Kanal für Nicht-User). Früh einrichten.
- **R2** Öffentliches `create_enrollment_request` = anon-Endpoint → Missbrauchs-Bremse (Validierung/Limit) nötig.
- **R3** RLS der neuen Tabellen: anon darf nur anlegen (via RPC), nichts lesen.
- **R4** Neue Routen → `routeTree.gen.ts` muss regenerieren (Router-Plugin); im Verify per Build sicherstellen.
