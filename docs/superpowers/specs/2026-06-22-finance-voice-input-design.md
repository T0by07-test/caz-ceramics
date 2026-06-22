# Finance Voice Input — Design-Spec

> Cazú Ceramics · Phase 2. Stand: 2026-06-22.
> Spec auf Deutsch, Code/Bezeichner auf Englisch.
> Vorgehen: Superpowers (brainstorming → writing-plans → Implementierung). Diese Datei ist das Ergebnis des Brainstormings.

## 1. Ziel

Cande soll neue Zahlungs-Events per Sprache erfassen können, ohne ein Formular ausfüllen zu müssen. Beispiel:

> *„Chris pagó hoy por este mes en efectivo"*
> → Bestätigungskarte mit `student_name: Chris`, `month: JUNIO`, `entry_date: heute`, `method: E`, `status: Pagado`, `amount_cents: null` (Cande ergänzt)

## 2. Getroffene Entscheidungen

- **FAB-Position: Global** auf allen Admin-Seiten (nicht nur Finance-Seiten). Grund: Cande tippt das Zahlungs-Event direkt wenn es passiert — auch wenn sie gerade auf Clases oder Alumnas ist.
- **Audio-Backend: Lovable AI Gateway** (nativ, kein extra API-Key). Kein OpenAI Whisper, kein direkter Anthropic-Key nötig.
- **Confirmation UX: Inline-Karte mit Edit-Modus** — alle extrahierten Felder sofort editierbar; Betrag (`amount_cents`) ist Pflichtfeld nur wenn `status = Pagado`.
- **Architektur: Option A** — FAB in `admin.tsx`, eine Edge Function, kein globaler Context/Portal.

## 3. Architektur

```
Admin-Seite
  └── admin.tsx
        ├── <AppShell items={...} />
        └── <VoiceFAB />          ← neu
              ├── useVoiceRecorder  ← hook
              ├── → fetch supabase/functions/finance-voice  (multipart audio)
              └── <ConfirmationDialog>
                    └── supabase.from('ledger_entries').insert()
```

**Neue Dateien:**

| Datei | Zweck |
|---|---|
| `src/components/finance/VoiceFAB.tsx` | FAB + Dialog + Formular-Logik |
| `src/hooks/useVoiceRecorder.ts` | MediaRecorder Lifecycle |
| `supabase/functions/finance-voice/index.ts` | Deno Edge Function |

**Geänderte Datei:**

| Datei | Änderung |
|---|---|
| `src/routes/admin.tsx` | `<VoiceFAB />` neben `<AppShell>` |

## 4. Komponenten

### 4.1 `useVoiceRecorder` Hook

```typescript
// Returns:
{
  state: 'idle' | 'recording' | 'processing',
  start: () => void,
  stop: () => Promise<Blob>,
  error: string | null,
}
```

Nutzt `MediaRecorder` mit `audio/webm;codecs=opus` (Fallback: `audio/ogg`). Akkumuliert Chunks in `ondataavailable`, gibt `Blob` zurück bei `onstop`. Läuft auf iOS Safari (MediaRecorder seit iOS 14.3 unterstützt).

### 4.2 `VoiceFAB` Komponente

Position: `fixed bottom-6 right-6 z-50`

**Drei Zustände:**
- **Idle:** Mic-Icon, primäre Farbe
- **Recording:** rotes Stop-Icon, `animate-pulse`
- **Processing:** Spinner (nach stop bis Dialog öffnet)

Klick-Logik:
```
idle → start() → recording
recording → stop() → processing → fetch edge function → confirmation dialog
```

### 4.3 Edge Function `finance-voice`

**Runtime:** Deno (Lovable Cloud Edge Functions)

**Endpoint:** `POST /functions/v1/finance-voice`

**Input:** `multipart/form-data`
- `audio`: Blob (webm/ogg)
- `today`: ISO-Datum-String (vom Client)

**Auth-Check:**
```typescript
const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { ... jwt ... } })
const { data: isAdmin } = await supabase.rpc('is_admin')
if (!isAdmin) return new Response('Forbidden', { status: 403 })
```

**Lovable AI Gateway Call:**
- Audio als base64 enkodiert
- Multimodales Modell: Audio + System-Prompt → JSON
- System-Prompt (Spanisch):

```
Eres asistente de Cazú Ceramics, estudio de cerámica en Valencia.
Extrae del audio los campos de pago y devuelve SOLO JSON válido sin markdown.

Campos:
- student_name: nombre del alumno (string)
- amount_cents: importe en céntimos enteros (integer o null si no se menciona)
- method: E=efectivo, T=tarjeta/Revolut, B=Bizum, R=Revolut (string)
- status: "Pagado" si dijo que pagó; "Pendiente" si debe o va a pagar (string)
- month: mes en mayúsculas en español (ENERO…DICIEMBRE) basado en contexto (string)
- entry_date: fecha ISO YYYY-MM-DD; "hoy" → {today} (string)
- item: descripción breve del concepto (string o null)
- category: categoría del ingreso (string o null)
- collector: array de nombres de profesoras que dan la clase, vacío si solo Cande (string[])
- notes: información adicional (string o null)

Hoy es {today}.
```

**Output:** `{ student_name, amount_cents, method, status, month, entry_date, item, category, collector, notes }`

**Fehlerbehandlung:**
- JSON-Parse schlägt fehl → `{ error: 'parse_failed', transcript: string }` mit Status 422
- Gateway-Fehler → `{ error: 'gateway_error', message: string }` mit Status 502

### 4.4 Bestätigungs-Dialog

shadcn `Dialog` (nicht Sheet — kompakter auf Mobile).

**Felder:**

| Feld | UI-Element | Pflicht wenn Pagado |
|---|---|---|
| `student_name` | Text Input | ✓ |
| `amount` (€) | Number Input (step=0.01) | ✓ |
| `method` | Select (E · Efectivo / T · Tarjeta / B · Bizum / R · Revolut) | ✓ |
| `status` | Select (Pagado / Pendiente) | — |
| `month` | Select (ENERO–DICIEMBRE) | ✓ |
| `entry_date` | Date Input | ✓ |
| `item` | Text Input | — |
| `category` | Text Input | — |
| `collector` | MultiTeacherSelect (bestehend) | — |
| `notes` | Textarea | — |

**Felder mit `null`-Wert** (vom Modell leer gelassen): leerer Input mit `border-warning`-Ring — visueller Hinweis für Cande ohne Fehlermeldung.

**On „Confirmar":**
1. Validierung: `student_name`, `month`, `entry_date` immer; `amount_cents`, `method` nur wenn `status = 'Pagado'`
2. `amount` (Euro-Float) → `amount_cents` (`Math.round(amount * 100)`)
3. `supabase.from('ledger_entries').insert(row)` — kein RPC nötig, direkter Insert, RLS admin-only erlaubt
4. `toast.success('Ingreso guardado')`
5. Dialog schließt, State resettet

**Error-Fallback (422 von Edge Function):**
Toast mit „No se pudo parsear el audio — añade manualmente" + Link-Button der `/admin/registro` öffnet.

## 5. Sicherheit

1. **Edge Function prüft Admin-Rolle** via `is_admin()` RPC (JWT) — kein Nicht-Admin kann Audio senden.
2. **Kein API-Key im Browser** — Lovable AI Gateway Key liegt serverseitig in Lovable Secrets.
3. **RLS** auf `ledger_entries` — nur Admins können schreiben (Doppelschutz).
4. **Audio wird nicht persistiert** — die Edge Function verarbeitet den Blob in-memory und verwirft ihn.

## 6. Abgrenzungen (nicht in Scope)

- Kein Push-to-Talk / Hold-Button (zu iOS-spezifisch)
- Keine Transkript-Anzeige in der UI (nur die extrahierten Felder)
- Kein Auto-Suggest von `student_name` aus vorhandenen Ledger-Einträgen (Phase 3 optional)
- Keine Mehrsprachigkeit (nur Spanisch)
- Kein Audio-Replay in der UI
