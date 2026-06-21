# Finance-Hub — Design-Spec

> Cazú Ceramics · Finanz-Modul. Stand: 2026-06-21.
> Spec auf Deutsch, Code/Bezeichner auf Englisch.
> Vorgehen: Superpowers (brainstorming → writing-plans → TDD-Implementierung). Diese Datei ist das Ergebnis des Brainstormings.

## 1. Ziel

Cande managt ihr komplettes Geschäft finanziell im Admin-Panel — ein **zentrales Hub**:

1. **Dashboard** mit Visualisierung ihrer Einnahmen, Ausgaben und des echten Netto-Gewinns (inkl. Steuerlogik).
2. **AI-Finanz-Chat** (read-only Berater): Fragen zu Zahlungen, Steuern, Rentabilität, Strategie.
3. **Sprach-Eingabe**: per Sprache neue Zahlungs-Events anlegen, z. B. *„Chris pagó hoy por este mes en efectivo"* → neue Zeile → Dashboard aktualisiert sich.

Das ursprüngliche „Google Sheet ins Projekt synchronisieren" ist im Kern **bereits erfüllt**: Candes Einnahmen-Sheet ist als Tabelle `ledger_entries` digitalisiert und über `/admin/registro` editierbar (App ist führend, kein laufender Sheet-Sync). Diese Spec baut den Hub **auf dem bestehenden Ledger auf** und ergänzt Ausgaben, Rechenlogik, Dashboard, Chat und Sprache.

## 2. Getroffene Entscheidungen (aus dem Brainstorming)

- **Source of Truth = App-DB.** Das Google Sheet wird einmalig importiert; danach ist die App die Arbeitsfläche. Kein bidirektionaler Sync (YAGNI, fragil).
- **Umfang = Einnahmen + Ausgaben** (volles Netto, echtes Plus/Minus mit Steuern).
- **Verhältnis zu Stripe `payments` = Ledger ist einzige Quelle für den Hub.** Candes Buch enthält bereits Kartenzahlungen (Método `T`); es ist vollständig. `/admin/pagos` (Stripe) bleibt separate Detailansicht. Stripe→Ledger-Auto-Insert ist ein späteres, optionales Upgrade.
- **Chat = read-only** (beraten, nicht schreiben). Schreiben läuft ausschließlich über Sprache/Formular.
- **Ein Lovable-Projekt** (kein separates Finanz-Projekt). Begründung: Auf Lovable Cloud hat jedes Projekt seine eigene managed DB; ein zweites Projekt müsste die Reservierungs-DB über einen geteilten Service-Key oder einen DB-Umzug anbinden — beides öffnet ein größeres Loch bzw. ist riskant für ein Live-System. Datensicherheit kommt aus RLS + least-privilege, nicht aus Projekt-Trennung.
- **Geräteunabhängige Sprach-Eingabe** (Cande nutzt iPhone + MacBook): Audio-Aufnahme + Server-Transkription statt Browser-Spracherkennung (Safari/iOS unzuverlässig).
- **LLM-Provider = Lovable AI Gateway** (nativ auf Lovable Cloud, kein extra Key, multimodal für Audio + Text). Umstellung auf Claude direkt später möglich.
- **Kommissionen = Cande → Lehrerin**, automatisch aus `collector` × Satz berechnet; Default-Satz pro Lehrerin im Admin, pro Klasse manuell überschreibbar; reduziert den Netto-Gewinn (s. 4.5).

## 3. Architektur-Prinzip

App-DB ist die Wahrheit. Wir **portieren das bestehende CoWork-Dashboard** (Chart.js, liest Google Drive) **in die Lovable-App** als native Lösung: Supabase-Daten + recharts im bestehenden Design-System (shadcn/Tailwind, Tokens wie `text-h1`, `shadow-card`, `bg-success`, `text-warning`).

**Eine** server-seitige Rechenquelle (`finance_monthly` RPC) liefert alle Zahlen — Dashboard *und* Chat nutzen dieselbe Quelle, keine doppelte Logik, keine divergierenden Zahlen.

## 4. Datenmodell

Die neuen Finanz-Tabellen (`expense_entries`, `finance_settings`, `commission_rates`) liegen in **`public`** mit **RLS admin-only** — **konsistent mit dem bestehenden `ledger_entries`** (das die `admin.registro.tsx`-Seite schon heute direkt via PostgREST unter RLS liest). Kein separates Schema / RPC-Gateway: das wäre auf Lovable Cloud Config-Reibung und inkonsistent zum App-Muster — die echte Sicherheitsgrenze ist die RLS. Bestehendes wird aufgegriffen, nicht dupliziert.

**Rechenlogik** (Resumen + Beneficio Neto + Kommissionen) lebt in einem **reinen TypeScript-Modul** `src/lib/finance/compute.ts`, unit-getestet mit **Vitest** gegen die bekannten Excel-Zahlen, das Dashboard und (Phase 3) der Chat gemeinsam nutzen — eine Quelle, voll testbar, passend zur kleinen Datenmenge. Kein Postgres-RPC (in SQL ohne lokale DB nicht TDD-bar).

### 4.1 `ledger_entries` (existiert — Tab *Pagos*)
Aktuelle Spalten: `id, entry_date, month, student_name, item, category, amount_cents, method, status, notes, created_at`.
**Ergänzung 1:** Spalte **`collector text[]`** (= wer hält die Einheit; Tab-Spalte *Cobra*). **Mehrfachauswahl**, weil eine Klasse/ein Workshop von mehreren Lehrerinnen gehalten werden kann (`{Sofi}`, `{Sofi, Martu}`). `Cande` selbst muss nicht getaggt werden — ihr gehört das Studio, sie kassiert generell alles. Bekannte Werte: `Cande`, `Sofi`, `Martu` (+ frei). UI = Multi-Select (Popover + Checkboxen / Command-Multi). **Treibt die Kommissions-Berechnung** (s. 4.5).
**Ergänzung 2:** Spalte **`commission_pct_override numeric`** (nullable) — pro Klasse manuell abweichender Kommissionssatz; überschreibt den Lehrerinnen-Default nur für diese Zeile. Sonst unverändert.

*Hinweis Migration:* Tabelle bleibt physisch wo sie ist (heute `public.ledger_entries`); ob sie ins `finance`-Schema verschoben wird, entscheiden wir im Plan (Verschieben bricht den Cast in `admin.registro.tsx` und braucht Type-Regen). Default: **in `public` belassen, RLS bleibt admin-only**, nur die NEUEN Tabellen (`expense_entries`, `finance_settings`) + RPCs liegen in `finance`. Das hält den Eingriff klein.

### 4.2 `finance.expense_entries` (NEU — Tab *Gastos*)
```
id            uuid pk default gen_random_uuid()
entry_date    date
month         text            -- 'ENERO' … 'DICIEMBRE' (uppercase, wie im Sheet)
category      text            -- z. B. 'Horno / Cocción', 'Materiales', 'Alquiler', 'Fijos'
provider      text            -- Proveedor (optional)
concept       text            -- Concepto
amount_cents  integer
method        text            -- T/E/B/R
notes         text
vat_cents     integer         -- 'IVA soportado' (absetzbare Vorsteuer)
created_at    timestamptz default now()
```

### 4.3 `finance.finance_settings` (NEU — die „gelben Zellen")
Eine Konfigurationszeile (singleton), editierbar im Admin:
```
iva_rate         numeric default 0.21    -- IVA % auf Declarado
irpf_rate        numeric default 0.15    -- IRPF % auf (Declarado - Gastos)
declared_pct     numeric default 0.80    -- Anteil des Umsatzes, der versteuert wird
fee_revolut_pct  numeric default 0.00    -- Kommission auf Método 'T'
fee_bizum_pct    numeric default 0.00    -- Kommission auf Método 'B'
updated_at       timestamptz default now()
```

### 4.4 Rechenquelle — `computeFinanceMonthly()` (TS-Modul, unit-getestet)
Reine Funktion in `src/lib/finance/compute.ts`: nimmt Ledger-Zeilen + Gastos + Settings + Kommissionssätze, liefert pro Monat exakt die Excel-Logik (Tabs *Resumen* + *Beneficio Neto*) plus Kommissionen. Felder pro Monat:

| Feld | Formel (aus der Excel verifiziert) |
|---|---|
| `facturado` (= Ingresos cobrados) | `SUM(amount where month=m AND status='Pagado')` |
| `pendiente` | `SUM(amount where month=m AND status='Pendiente')` |
| `n_pagos` | `COUNT(where month=m AND status='Pagado')` |
| `gastos` | `SUM(expense.amount where month=m)` |
| `iva_soportado` | `SUM(expense.vat_cents where month=m)` |
| `declarado` | `ROUND(facturado * declared_pct, 2)` |
| `efectivo_exento` | `facturado - declarado` |
| `comision_cobro` | `ROUND(SUM(amount: Pagado,method='T')*fee_revolut_pct + SUM(amount: Pagado,method='B')*fee_bizum_pct, 2)` |
| `iva_a_pagar` | `ROUND(declarado * iva_rate - iva_soportado, 2)` |
| `irpf` | `ROUND(MAX(declarado - gastos, 0) * irpf_rate, 2)` |
| `comisiones_profesores` | `Σ über Lehrerinnen (s. 4.5)` — was Cande diesen Monat an Sofi/Martu zahlt |
| `beneficio_neto` | `facturado - gastos - comision_cobro - comisiones_profesores - iva_a_pagar - irpf` |
| `beneficio_simple` (Resumen) | `facturado - gastos` |

Wichtig: **„Facturado" = nur `Pagado`** (kassiert), nicht inkl. Pendiente — so macht es die Excel (`Beneficio Neto!B = Resumen!B = ingresos cobrados`). `efectivo_exento` ist die 80 %-Regel-Vereinfachung (nicht die echte Método-`E`-Summe), bewusst 1:1 wie im Sheet. **Neu ggü. der Excel:** `comisiones_profesores` (Lehrerinnen-Honorare) wird vom Netto abgezogen — im neuen Modell kassiert Cande 100 % und zahlt die Lehrerinnen aus (s. 4.5). Fiskalische Behandlung mit Gestor validieren.

### 4.5 Kommissionen (Lehrerinnen-Honorare)

**Modell:** Cande gehört das Studio und kassiert generell alle Einnahmen. Wird eine Einheit von einer anderen Lehrerin (Sofi, Martu, …) gehalten, zahlt Cande dieser eine **Kommission**. Richtung also **immer Cande → Lehrerin**.

- **`finance.commission_rates`** (NEU, admin-editierbar): `teacher text pk`, `default_pct numeric`, `active bool`, `updated_at`. Default-Satz von Cande gesetzt (Vorschlag Sofi `0.65`, Martu n. Absprache — bestätigen).
- **Per-Klasse-Override:** `ledger_entries.commission_pct_override` überschreibt den Default nur für diese Zeile (flexibel pro Klasse).
- **Berechnung** pro Lehrerin `T`, Monat `m`:
  `comision[T] = Σ` über Einträge `e` mit `e.month=m`, `e.status='Pagado'`, `T = ANY(e.collector)`, `T≠'Cande'`, von `rate(e,T) × anteil(e)` —
  mit `rate(e,T) = COALESCE(e.commission_pct_override, default_pct(T))` und `anteil(e) = e.amount_cents / Anzahl(Nicht-Cande-Lehrerinnen in e.collector)` (gleichmäßige Aufteilung bei mehreren Lehrerinnen; seltener Fall, dokumentiert).
- Basis = **Pagado** (kassierte Einnahmen). `comisiones_profesores` (Summe über alle Lehrerinnen) fließt als Abzug in `beneficio_neto` (4.4).
- **Historische Monate (ene–may)** haben keine `collector`-Tags → `comisiones_profesores = 0`; die alten Lump-„Comisión Sofi"-Einnahmezeilen bleiben wie importiert (echtes historisches Geld). Das neue Modell greift **ab den neu getaggten Einträgen**. So bleiben die bekannten Excel-Netto-Zahlen als Verifikations-Baseline gültig.
- **Kein Doppelzählen:** Kommissionen werden **berechnet**, nicht zusätzlich als `expense_entries` gebucht. Die tatsächliche Auszahlung ist die Liquidación dieser berechneten Schuld (kein neuer Gasto).

## 5. Subsysteme

### 5.1 Dashboard `/admin/finanzas` (zentrales Hub, neue Finanz-Landing)
Portiert die Sektionen des CoWork-Artefakts mit recharts:
- **KPIs:** Facturado YTD · Beneficio neto YTD · Media neto/Monat · Pendiente total.
- **Bar-Chart:** Facturado vs. Beneficio neto pro Monat (nur Monate mit echten Daten).
- **Pendientes por cobrar:** Tabs pro Monat, Liste pro Person → koppelbar an die bestehende **B3-Zahlungserinnerung** (Mahnliste).
- **Ingresos por categoría** (pro Monat, Balken).
- **Pendiente de cobro por mes.**
- **Método de pago** (Donut, pro Monat).
- **Comisiones a pagar** (NEU): pro Monat, was Cande an jede Lehrerin zahlt (Sofi/Martu) + YTD, mit Detail-Liste pro Klasse. Quelle: 4.5.
- **Detalle mensual (neto real):** Tabelle Mes · Facturado · Efectivo exento · Gastos · IVA · IRPF · Beneficio neto.
- **Stil:** warmes Keramik-Gefühl, aber über die App-Design-Tokens (nicht die Hex-Werte des Artefakts hartkodieren).

### 5.2 Gastos `/admin/gastos`
CRUD analog `/admin/registro` (Liste, Filter, Sheet-Formular, Delete), plus Feld **IVA soportado**. Schreibt `finance.expense_entries`.

### 5.3 Settings (Steuer-Parameter)
Kleine UI (auf dem Dashboard oder unter `/admin/finanzas`), die `finance.finance_settings` editiert (IVA/IRPF/Declarado %/Gebühren) **und die Kommissionssätze pro Lehrerin** (`finance.commission_rates`). Mit Hinweis „orientativo, validar con gestor".

### 5.4 Sprach-Eingabe (Phase 2)
Flow, geräteunabhängig:
1. Mic-Button → `MediaRecorder` nimmt Audio auf (läuft auch auf iOS Safari).
2. Upload an Edge Function **`finance-voice`** (admin-checked).
3. Function → Lovable AI Gateway (multimodales Modell) → liefert **Transkript + strukturierte Felder**: `{entry_date, month, student_name, item, category, amount_cents, method, status, collector, notes, confidence}`.
4. **Bestätigungskarte** (editierbar) im UI: Cande prüft/korrigiert (z. B. fehlender Betrag), tippt *Confirmar*.
5. Insert in `ledger_entries` via RPC.
6. Defaults/Heuristik: „hoy" → heute; „este mes" → aktueller Monat (uppercase ES); „en efectivo" → `E`; Status default `Pagado` wenn „pagó".

Beispiel: *„Chris pagó hoy por este mes en efectivo"* → `{student_name:'Chris', month:'JUNIO', entry_date:today, method:'E', status:'Pagado', amount_cents:null→Cande ergänzt}`.

### 5.5 AI-Finanz-Chat (Phase 3)
Edge Function **`finance-chat`** (admin-checked, read-only):
- **System-Prompt = Geschäftskontext** (aus der CoWork-`CLAUDE.md`: Geschäftsfelder, Preise, Kosten, Steuerregeln, Sofi-Deal, Ziele) → echter „asesor financiero", nicht nur SQL-Bot.
- **Daten** = kompakte Vorladung: aktuelle `finance_monthly`-Zahlen + bei Bedarf relevante Ledger-Slices (z. B. Pendientes). *Approach: vorladen statt Text-to-SQL — Datenmenge winzig, robust, kein Injection-Risiko.*
- Antwortet auf Spanisch. Optional später: getypte Tools (`get_month`, `list_pending`).

## 6. Sicherheit (Hardening)

Sorge = Datensensibilität/Zugriff. Maßnahmen, alle in einem Projekt:
1. **RLS admin-only** auf allen Finanztabellen (`is_admin()`, USING + WITH CHECK) — wie schon `ledger_entries`. Nicht-Admins können physisch nichts lesen.
2. **RLS ist die Sicherheitsgrenze** (nicht Schema-Verstecken): neue Tabellen in `public` mit `is_admin()`-RLS (USING + WITH CHECK), exakt wie `ledger_entries` heute. Direkter PostgREST-Lesezugriff nur für Admins; Rechenlogik im Client/Edge aus diesen RLS-geschützten Zeilen.
3. **Kein `service_role`-Key im Browser.** Client: Anon-Key + Candes Admin-JWT; RLS entscheidet.
4. **Edge Functions prüfen zuerst Admin-Rolle** (JWT); Keys nur serverseitig (Lovable Secrets).
5. **LLM bekommt nur nötige, aggregierte Zahlen** (read-only Chat); keine Exfiltration.
6. **Manueller Security-Review** vor Go-live (RLS-Tests: Nicht-Admin sieht nichts; kein Key im Bundle).
7. Optional „Gürtel+Hosenträger": Re-Auth/PIN-Gate vor dem Finanzbereich (nur falls gewünscht — aktuell **nicht** in Scope).

## 7. Daten-Import (= „Sheet ins Projekt")

Einmaliger Import der Excel `Cazu_Finanzas.xlsx` (4 Tabs) via Lovable SQL-editor:
- *Pagos* (ene–may real, jun–dic Template) → `ledger_entries` (inkl. `collector`).
- *Gastos* → `finance.expense_entries`.
- Generierung: aus der `.xlsx` ein SQL-Insert-Skript bauen; **PII bleibt aus dem Repo** (`/tmp`, wie beim Juni-Import).
- **Reconcile:** Vorhandene Juni-Zeilen im App-Ledger gegen die Excel abgleichen, damit nichts doppelt landet.
- *Resumen*/*Beneficio Neto* werden **nicht** importiert (berechnet `finance_monthly` zur Laufzeit).

## 8. Navigation

Gruppe „Finanzas" in `admin.tsx`:
- **Dashboard** → `/admin/finanzas` (neu, Hub-Landing)
- **Ingresos** → `/admin/registro` (existiert, ggf. Label „Ingresos")
- **Gastos** → `/admin/gastos` (neu)
- Chat + Sprache leben auf dem Dashboard.
- `/admin/pagos` (Stripe) bleibt separat unter „Pagos".

## 9. Phasen (diese Spec ist der Schirm; jede Phase bekommt einen eigenen Implementierungsplan)

- **Phase 1 — Fundament + Dashboard** (im Plan in **1a Fundament** + **1b Dashboard/UI** geteilt):
  - **1a:** Migration (Tabellen in `public` + RLS admin-only): `ledger_entries` um `collector text[]` + `commission_pct_override` erweitern, `expense_entries`, `finance_settings`, `commission_rates`. `computeFinanceMonthly()` TS-Modul (Vitest, inkl. `comisiones_profesores`). Voll-Import der Excel (Real-Monate, June reconcile).
  - **1b:** Dashboard `/admin/finanzas` (KPIs/Charts inkl. Comisiones-Karte), Gastos-CRUD `/admin/gastos`, Settings-UI (Steuer + Kommissionssätze), Registro-Formular um collector-Multi-Select + Override, Nav-Gruppe, Fix doppeltes `R`-Item.
  - → liefert „Sheet drin + Dashboard + echtes Netto + Kommissionen".
- **Phase 2 — Sprach-Eingabe:** `finance-voice` + Aufnahme-UI + Bestätigungskarte.
- **Phase 3 — AI-Finanz-Chat:** `finance-chat` + Chat-UI mit Geschäftskontext.

## 10. Build-Weg

Code hier im Repo (TanStack Start/React/shadcn/recharts). DB-Änderungen als SQL für den **Lovable SQL-editor** (Migrationen laufen auf Lovable Cloud nicht automatisch). **Tobi steuert Push/PR** — nichts ungefragt committen/pushen. Implementierung mit TDD; parallele Komponenten-Arbeit + Review via Workflow/Subagents.

## 11. Geklärte Punkte (Stand 2026-06-21)

- **Método `R` = Revolut** (bestätigt). → das doppelte / „R · ?"-`SelectItem` in `admin.registro.tsx` in Phase 1 entfernen (nur `R · Revolut`).
- **`collector` = Mehrfachauswahl** (`text[]`) — treibt die Kommissions-Berechnung (4.1, 4.5).
- **Kommissionsmodell = Cande → Lehrerin**, auto-berechnet; Default-Satz pro Lehrerin (Admin) + Override pro Klasse (4.5). Ersetzt das alte „Sofi-Kommission als manuelle Income-Zeile". Default-Sätze (Sofi `0.65`? Martu?) von Cande bestätigen lassen.
- **Import = nur Real-Monate** (ene–may) + aktueller Monat (Juni, liegt schon im App-Ledger → reconcilen). **Keine** jul–dic-Platzhalter; optional später ein „Monat aus Vormonat-Vorlage anlegen"-Helfer.
- **`ledger_entries` Typen**: heute Cast-Hack (nicht in generierten Supabase-Types); in Phase 1 Types regenerieren oder Cast beibehalten (entscheidet der Plan).

## 12. Nicht in Scope (YAGNI)

- Bidirektionaler Google-Sheet-Sync.
- Stripe→Ledger-Auto-Insert (späteres Upgrade).
- Chat mit Schreibrechten (v1 read-only).
- PDF-Export (evtl. später; CSV ggf. einfach).
- Voucher-/Deferred-Revenue-Buchhaltung (vorerst nur als Kategorie).
- Multi-User-Finanzen / Rollen jenseits Admin.
