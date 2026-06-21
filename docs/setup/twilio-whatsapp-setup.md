# Twilio WhatsApp einrichten — Schritt-für-Schritt (Cazu Ceramics)

Ziel: WhatsApp-Benachrichtigungen aus der App heraus versenden (Reservierungs-Bestätigungen, Reminder, Stornos, Recuperaciones …). Der **Code ist fertig** und wartet nur auf (a) die Twilio-Zugangsdaten und (b) die genehmigten Templates.

> ⏳ **Wichtigste Erkenntnis zuerst:** Der Code ist *nicht* der Engpass. Der Engpass ist **Metas Business-Verifizierung** — die kann laut Twilio „**mehrere Wochen**" dauern. Deshalb: **Phase 2 (Production-Sender) heute starten.** Testen kannst du parallel sofort über die Sandbox (Phase 1).

---

## Überblick: 3 Phasen

| Phase | Was | Account-Status | Dauer |
|---|---|---|---|
| **1. Sandbox** | Code *jetzt* testen, ohne Genehmigung | Free-Trial reicht | 10 Min |
| **2. Production-Sender** | Echte WhatsApp-Nummer via Self Sign-up + Meta-Verifizierung | **Upgrade nötig** | Tage–Wochen (Meta) |
| **3. Templates** | 8 Nachrichten-Vorlagen anlegen + genehmigen lassen | nach Sender-Approval | Stunden–Tage |

Am Ende setzt du die Zugangsdaten als **Supabase Secrets** (Phase 4) — dann ist der Versand live.

---

## Phase 0 — API-Key erstellen (für alle Phasen nötig)

Der Code authentifiziert sich per **API-Key** (nicht per Auth-Token). Du brauchst 3 Werte:

1. **Twilio Console** öffnen → Dashboard. Oben steht die **Account SID** (beginnt mit `AC…`) → das ist `TWILIO_ACCOUNT_SID`.
2. Console → **Account → API keys & tokens** → **Create API key**.
   - Typ: **Standard**. Name z.B. `cazu-app`.
   - Du bekommst:
     - **SID** (beginnt mit `SK…`) → `TWILIO_API_KEY_SID`
     - **Secret** → `TWILIO_API_KEY_SECRET` ⚠️ **wird nur EINMAL angezeigt** — sofort sicher kopieren.

> Diese 3 Werte gelten für Sandbox **und** Production. Nur die Absender-Nummer (`TWILIO_WHATSAPP_FROM`) unterscheidet sich.

---

## Phase 1 — Jetzt testen über die WhatsApp-Sandbox

Damit testen wir den App-Code, *bevor* die Production-Genehmigung da ist. Kein Upgrade, keine Templates nötig (in der Sandbox darf frei getextet werden).

1. Console → **Messaging → Try it out → Send a WhatsApp message** (Sandbox).
2. Dort steht die **Sandbox-Nummer** (meist `+1 415 523 8886`) und ein **Join-Code** (z.B. „join orange-tiger").
3. Mit **deinem eigenen** WhatsApp diese Nachricht an die Sandbox-Nummer schicken → dein Handy ist jetzt opt-in.
4. Zum App-Test setzt du vorübergehend `TWILIO_WHATSAPP_FROM = +14155238886` (Sandbox-Nummer) und testest gegen deine eigene, verbundene Nummer.

✅ Damit verifizieren wir: API-Key korrekt, Versand-Pfad funktioniert, Nachricht kommt an.
⚠️ Sandbox ist **nur zum Testen** — Empfängerinnen müssten erst den Join-Code schicken. Nicht für echte Schülerinnen.

---

## Phase 2 — Production-Sender (die lange Leitung — heute starten!)

### Voraussetzungen
- **Twilio-Account upgraden:** Console → **Upgrade** (oben) bzw. **Admin → Account billing**. Trial kann keinen Production-Sender betreiben.
- **Meta Business Portfolio:** Admin-Zugang zu einem bestehenden, ODER eines wird im Prozess neu erstellt (dann folgt Metas Business-Verifizierung).
- **Telefonnummer für WhatsApp:** Muss WhatsApp-tauglich sein, **darf noch nicht** bei WhatsApp registriert sein, und muss SMS/Anruf zur Verifizierung empfangen können. (Tipp: am besten eine eigene Nummer nur für das Studio, nicht Candes private WhatsApp.)

### Schritte in der Console
1. **Messaging → Senders → WhatsApp Senders** → **Create new sender**.
2. Nummer wählen (Twilio- oder eigene Nummer) → **Continue**.
3. **Continue with Facebook** → das Self-Sign-up-Popup öffnet sich.

### Im Facebook-Popup
1. **Bei Facebook einloggen.**
2. **Meta Business Portfolio** wählen oder neu erstellen.
3. **WhatsApp Business Account (WABA)** neu anlegen (oder bestehenden wählen).
4. **Profil:** Business-Name, **Display-Name** (muss Metas Display-Name-Richtlinien erfüllen, z.B. „Cazu Ceramics"), Kategorie, optional Beschreibung + Website (`cazuceramics.com`).
5. **Nummer verifizieren** (Code per SMS/Anruf).
6. **Twilio-Zugriff bestätigen** → Confirm.

### Danach
- Hast du ein **neues** Business Portfolio erstellt, musst du **Metas Business-Verifizierung** abschließen, bevor du in Produktion gehst (höhere Sende-Limits, weitere Sender). → **Das ist der Wochen-Teil. Sofort anstoßen.**
- Nach Sender-Approval ist deine **Production-WhatsApp-Nummer** der Wert für `TWILIO_WHATSAPP_FROM` (Format `+34…`, E.164).

---

## Phase 3 — Die 8 Templates anlegen + genehmigen lassen

> Dein Account (nach Juli 2024 erstellt) **muss** den **Content Template Builder** nutzen — Legacy-Templates sind gesperrt.

### Vorgehen je Template
1. Console → **Messaging → Content Template Builder** (Suche „Content Template Builder", falls nicht im Menü) → **Create new template**.
2. **Name** (siehe Tabelle unten, snake_case), **Language**: `Spanish (es)` bzw. `es_ES`, **Content type**: `Text`.
3. **Body** = den spanischen Text unten **1:1 einfügen**. Variablen über **+ Add Variable** bzw. direkt als `{{1}}`, `{{2}}` … eintippen.
4. Für variablen-Templates **Beispielwerte** angeben (Pflicht für Approval), z.B. `{{1}}=María`.
5. **Save and submit for WhatsApp approval** → **Kategorie** wählen (siehe Tabelle, meist **UTILITY**).
6. Nach Genehmigung bekommt das Template eine **Content SID** (beginnt mit `HX…`) → die brauchst du in Phase 4.

> ⚠️ WhatsApp-Variablen-Regeln: fortlaufend nummeriert ({{1}},{{2}},…), nicht direkt nebeneinander, nicht ganz am Anfang/Ende, genug Normaltext drumherum. Die Texte unten erfüllen das bereits.

### Die Templates (Spanisch, copy-paste-fertig)

**1. `reservation_confirmed`** → Secret `TWILIO_TEMPLATE_RESERVATION_CONFIRMED` · UTILITY
```
Hola {{1}}, tu reserva está confirmada. Te esperamos en el estudio. Si necesitas cancelar, recuerda hacerlo con más de 3 horas de antelación para recuperar el crédito.
```

**2. `plan_purchased`** → `TWILIO_TEMPLATE_PLAN_PURCHASED` · UTILITY
```
Hola {{1}}, tu plan está activo y tus créditos del mes ya están listos. Reserva tus clases desde la app cuando quieras.
```

**3. `reminder_24h`** → `TWILIO_TEMPLATE_REMINDER_24H` · UTILITY
`{{1}}`=Name, `{{2}}`=Datum, `{{3}}`=Beginn, `{{4}}`=Ende
```
Hola {{1}}, te recordamos tu clase del {{2}} de {{3}} a {{4}}. Si no puedes venir, cancela con más de 3 horas de antelación, por favor.
```

**4. `class_cancelled`** → `TWILIO_TEMPLATE_CLASS_CANCELLED` · UTILITY
```
Hola {{1}}, hemos tenido que cancelar una de tus clases próximas. Te hemos añadido una recuperación válida hasta fin de mes para que reserves otro día.
```

**5. `makeup_available`** → `TWILIO_TEMPLATE_MAKEUP_AVAILABLE` · UTILITY
```
Hola {{1}}, tienes una clase de recuperación disponible. Recuerda usarla antes de fin de mes desde la sección Recuperaciones de la app.
```

**6. `waitlist_promoted_plan`** (Nachrücken mit Plan, ohne Zahlung) → `TWILIO_TEMPLATE_WAITLIST_PROMOTED_PLAN` · UTILITY
```
Hola {{1}}, se ha liberado una plaza y te la hemos asignado con tu plan. ¡Te esperamos en el estudio!
```

**7. `waitlist_promoted_pay`** (Nachrücken mit Zahlung) → `TWILIO_TEMPLATE_WAITLIST_PROMOTED_PAY` · UTILITY
```
Hola {{1}}, se ha liberado una plaza y te la hemos asignado. Para confirmarla, completa el pago desde tu reserva en los próximos 30 minutos.
```

**8. `monthly_summary`** → `TWILIO_TEMPLATE_MONTHLY_SUMMARY` · ⚠️ ggf. **MARKETING**
`{{1}}`=Name, `{{2}}`=genutzt, `{{3}}`=gesamt, `{{4}}`=Rest, `{{5}}`=Recups
```
Hola {{1}}, este mes has usado {{2}} de {{3}} créditos y te quedan {{4}}. Recuperaciones pendientes: {{5}}. Recuerda que los créditos no se acumulan al mes siguiente.
```
> Meta könnte die Monats-Zusammenfassung als **MARKETING** einstufen → braucht Marketing-Opt-in. Mit Cande klären, ob das Template überhaupt gewünscht ist.

---

## Phase 4 — Secrets in Supabase setzen (der „Go-live-Schalter")

Supabase → Projekt `gqucwldwbfjfxrqwvpqj` → **Edge Functions → Secrets** (NICHT in git!). Setzen:

| Secret | Wert | Quelle |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | `AC…` | Phase 0 |
| `TWILIO_API_KEY_SID` | `SK…` | Phase 0 |
| `TWILIO_API_KEY_SECRET` | (geheim) | Phase 0 |
| `TWILIO_WHATSAPP_FROM` | `+34…` (Prod) bzw. `+14155238886` (Sandbox-Test) | Phase 1/2 |
| `TWILIO_TEMPLATE_RESERVATION_CONFIRMED` | `HX…` | Phase 3 |
| `TWILIO_TEMPLATE_PLAN_PURCHASED` | `HX…` | Phase 3 |
| `TWILIO_TEMPLATE_REMINDER_24H` | `HX…` | Phase 3 |
| `TWILIO_TEMPLATE_CLASS_CANCELLED` | `HX…` | Phase 3 |
| `TWILIO_TEMPLATE_MAKEUP_AVAILABLE` | `HX…` | Phase 3 |
| `TWILIO_TEMPLATE_WAITLIST_PROMOTED_PLAN` | `HX…` | Phase 3 |
| `TWILIO_TEMPLATE_WAITLIST_PROMOTED_PAY` | `HX…` | Phase 3 |
| `TWILIO_TEMPLATE_MONTHLY_SUMMARY` | `HX…` (falls genutzt) | Phase 3 |

Sobald alle gesetzt sind und die Templates genehmigt: **Versand ist live.** (Der Code überspringt WhatsApp automatisch, solange Twilio-Secrets fehlen — kein Risiko, halb-konfiguriert zu deployen.)

---

## Checkliste

- [ ] Phase 0: API-Key erstellt, 3 Werte sicher notiert
- [ ] Phase 1: Sandbox getestet, Nachricht auf eigenem Handy erhalten
- [ ] Phase 2: Account upgraded, Self-Sign-up gestartet, **Meta-Business-Verifizierung läuft**
- [ ] Phase 3: 8 (bzw. 7) Templates angelegt + zur Genehmigung eingereicht
- [ ] Phase 3: Content SIDs (`HX…`) nach Genehmigung notiert
- [ ] Phase 4: Alle Secrets in Supabase gesetzt
- [ ] End-to-End: echte Test-Reservierung löst echte WhatsApp aus

---

## Quellen
- [WhatsApp Self Sign-up (Twilio Docs)](https://www.twilio.com/docs/whatsapp/self-sign-up)
- [Content Template Builder (Twilio Docs)](https://www.twilio.com/docs/content/create-templates-with-the-content-template-builder)
- [Production sender & template creation (Twilio Support)](https://support.twilio.com/hc/en-us/articles/360039246774-Twilio-WhatsApp-production-sender-and-template-creation)
- [WhatsApp Business Platform Overview (Twilio Docs)](https://www.twilio.com/docs/whatsapp/api)
