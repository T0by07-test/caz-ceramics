# Finance Voice Input — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global Floating Action Button on all admin pages that lets Cande record a voice note, transcribes + parses it server-side, and inserts the result into `ledger_entries` after a quick confirmation dialog.

**Architecture:** FAB rendered in `admin.tsx` (global admin shell). A thin `useVoiceRecorder` hook handles MediaRecorder lifecycle. An Edge Function `finance-voice` calls OpenAI Whisper for STT → Claude for structured JSON extraction. A Dialog component presents extracted fields for confirmation + inline correction before Supabase insert.

**Tech Stack:** React 19, TanStack Router, shadcn/ui (Dialog, Select, Input, Textarea), Vitest (pure helper tests), Supabase Edge Functions (Deno), OpenAI Whisper API, Anthropic Messages API (claude-sonnet-4-6), lucide-react.

**Secrets required (set once in Lovable Secrets Manager before deploying):**
- `OPENAI_API_KEY` — for Whisper transcription
- `ANTHROPIC_API_KEY` — for field extraction

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/finance/voice.ts` | Types + pure helpers (normalize, validate) |
| Create | `src/lib/finance/voice.test.ts` | Vitest tests for helpers |
| Create | `src/hooks/useVoiceRecorder.ts` | MediaRecorder lifecycle hook |
| Create | `src/components/finance/VoiceFAB.tsx` | FAB + Dialog + form + Supabase insert |
| Create | `supabase/functions/finance-voice/index.ts` | Deno edge function (Whisper + Claude) |
| Modify | `src/routes/admin.tsx` | Add `<VoiceFAB />` to admin layout |
| Modify | `supabase/config.toml` | Register new function |

---

## Task 1: Pure helpers — voice.ts + tests

**Files:**
- Create: `src/lib/finance/voice.ts`
- Create: `src/lib/finance/voice.test.ts`

- [ ] **Step 1: Create `src/lib/finance/voice.ts`**

```typescript
export interface VoiceExtracted {
  student_name: string | null;
  amount_cents: number | null;
  method: string | null;
  status: "Pagado" | "Pendiente";
  month: string | null;
  entry_date: string | null;
  item: string | null;
  category: string | null;
  collector: string[];
  notes: string | null;
}

export function normalizeVoiceFields(raw: unknown): VoiceExtracted | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    student_name: typeof r.student_name === "string" && r.student_name ? r.student_name : null,
    amount_cents: typeof r.amount_cents === "number" ? Math.round(r.amount_cents) : null,
    method: typeof r.method === "string" && r.method ? r.method.toUpperCase() : null,
    status: r.status === "Pendiente" ? "Pendiente" : "Pagado",
    month: typeof r.month === "string" && r.month ? r.month.toUpperCase() : null,
    entry_date: typeof r.entry_date === "string" && r.entry_date ? r.entry_date : null,
    item: typeof r.item === "string" && r.item ? r.item : null,
    category: typeof r.category === "string" && r.category ? r.category : null,
    collector: Array.isArray(r.collector)
      ? (r.collector as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
    notes: typeof r.notes === "string" && r.notes ? r.notes : null,
  };
}

export function validateVoiceForm(f: VoiceExtracted): string[] {
  const errors: string[] = [];
  if (!f.student_name) errors.push("Nombre del alumno requerido");
  if (!f.month) errors.push("Mes requerido");
  if (!f.entry_date) errors.push("Fecha requerida");
  if (f.status === "Pagado") {
    if (f.amount_cents === null) errors.push("Importe requerido para pagos cobrados");
    if (!f.method) errors.push("Método de pago requerido");
  }
  return errors;
}
```

- [ ] **Step 2: Create `src/lib/finance/voice.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { normalizeVoiceFields, validateVoiceForm } from "./voice";

describe("normalizeVoiceFields", () => {
  it("returns null for non-object input", () => {
    expect(normalizeVoiceFields(null)).toBeNull();
    expect(normalizeVoiceFields("string")).toBeNull();
    expect(normalizeVoiceFields(42)).toBeNull();
  });

  it("normalizes a complete payload", () => {
    const raw = {
      student_name: "Chris",
      amount_cents: 1500,
      method: "e",
      status: "Pagado",
      month: "junio",
      entry_date: "2026-06-22",
      item: "Clase adultos",
      category: "Adulto",
      collector: ["Sofi"],
      notes: null,
    };
    const r = normalizeVoiceFields(raw)!;
    expect(r.student_name).toBe("Chris");
    expect(r.amount_cents).toBe(1500);
    expect(r.method).toBe("E");
    expect(r.month).toBe("JUNIO");
    expect(r.collector).toEqual(["Sofi"]);
    expect(r.notes).toBeNull();
  });

  it("defaults status to Pagado when unknown", () => {
    const r = normalizeVoiceFields({ status: "weirdvalue" })!;
    expect(r.status).toBe("Pagado");
  });

  it("sets Pendiente when specified", () => {
    const r = normalizeVoiceFields({ status: "Pendiente" })!;
    expect(r.status).toBe("Pendiente");
  });

  it("rounds fractional amount_cents", () => {
    const r = normalizeVoiceFields({ amount_cents: 1499.9 })!;
    expect(r.amount_cents).toBe(1500);
  });

  it("filters non-string values from collector array", () => {
    const r = normalizeVoiceFields({ collector: ["Sofi", 42, null, "Martu"] })!;
    expect(r.collector).toEqual(["Sofi", "Martu"]);
  });
});

describe("validateVoiceForm", () => {
  const base = {
    student_name: "Ana",
    amount_cents: 1500,
    method: "E",
    status: "Pagado" as const,
    month: "JUNIO",
    entry_date: "2026-06-22",
    item: null,
    category: null,
    collector: [],
    notes: null,
  };

  it("passes a complete valid Pagado form", () => {
    expect(validateVoiceForm(base)).toHaveLength(0);
  });

  it("requires student_name", () => {
    const errs = validateVoiceForm({ ...base, student_name: null });
    expect(errs).toContain("Nombre del alumno requerido");
  });

  it("requires month", () => {
    const errs = validateVoiceForm({ ...base, month: null });
    expect(errs).toContain("Mes requerido");
  });

  it("requires amount and method when status is Pagado", () => {
    const errs = validateVoiceForm({ ...base, amount_cents: null, method: null });
    expect(errs).toContain("Importe requerido para pagos cobrados");
    expect(errs).toContain("Método de pago requerido");
  });

  it("does not require amount/method when status is Pendiente", () => {
    const errs = validateVoiceForm({
      ...base,
      status: "Pendiente",
      amount_cents: null,
      method: null,
    });
    expect(errs).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests — expect all 9 to pass**

```bash
npx vitest run src/lib/finance/voice.test.ts
```

Expected output: `9 passed`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/finance/voice.ts src/lib/finance/voice.test.ts
git commit -m "feat(finance): voice field helpers + validation (tested)"
```

---

## Task 2: `useVoiceRecorder` hook

**Files:**
- Create: `src/hooks/useVoiceRecorder.ts`

- [ ] **Step 1: Create `src/hooks/useVoiceRecorder.ts`**

```typescript
import { useRef, useState, useCallback } from "react";

export type RecorderState = "idle" | "recording" | "processing";

export interface UseVoiceRecorder {
  state: RecorderState;
  start: () => void;
  stop: () => Promise<Blob>;
  error: string | null;
}

export function useVoiceRecorder(): UseVoiceRecorder {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/ogg;codecs=opus";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250); // collect chunks every 250ms
      setState("recording");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone access denied");
    }
  }, []);

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        reject(new Error("No active recorder"));
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        // Stop all tracks to release the mic
        recorder.stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        setState("processing");
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  return { state, start, stop, error };
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no new errors related to `useVoiceRecorder.ts` (pre-existing `admin.clases.tsx` errors are unrelated).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useVoiceRecorder.ts
git commit -m "feat(finance): useVoiceRecorder hook (MediaRecorder lifecycle)"
```

---

## Task 3: Edge Function `finance-voice`

**Files:**
- Create: `supabase/functions/finance-voice/index.ts`
- Modify: `supabase/config.toml`

**Prerequisites:** Before deploying to Lovable, add two secrets in Lovable's Secret Manager:
- `OPENAI_API_KEY` — from platform.openai.com (used for Whisper STT)
- `ANTHROPIC_API_KEY` — from console.anthropic.com (used for field extraction)

- [ ] **Step 1: Create `supabase/functions/finance-voice/index.ts`**

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildExtractionPrompt(transcript: string, today: string): string {
  return `You are an assistant for Cazú Ceramics, a pottery studio in Valencia, Spain.
Extract payment info from the transcription below and return ONLY valid JSON, no markdown, no explanation.

Today is ${today}. Current month in Spanish: ${new Date(today).toLocaleString("es-ES", { month: "long" }).toUpperCase()}.

JSON fields:
- student_name: student name string (null if not mentioned)
- amount_cents: integer cents (null if not mentioned)
- method: single char — E=efectivo/cash, T=tarjeta/card, B=Bizum, R=Revolut (null if unclear)
- status: "Pagado" if they paid now/already; "Pendiente" if will pay later
- month: month in uppercase Spanish, e.g. JUNIO (use current month if "este mes")
- entry_date: ISO date YYYY-MM-DD ("hoy" → ${today})
- item: short description or null
- category: category or null
- collector: array of teacher names who ran the class ([] if only Cande or unclear)
- notes: any extra info or null

Transcription: "${transcript}"`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Authentication required" }, 401);

    // Verify admin role using caller's JWT
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const adminDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData?.user) return jsonResponse({ error: "Authentication required" }, 401);

    const { data: profile } = await adminDb
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile || profile.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403);

    // Parse multipart form
    const formData = await req.formData();
    const audioFile = formData.get("audio");
    const today = (formData.get("today") as string) ?? new Date().toISOString().slice(0, 10);

    if (!audioFile || !(audioFile instanceof File)) {
      return jsonResponse({ error: "Missing audio file" }, 400);
    }

    // Step 1: Transcribe audio with OpenAI Whisper
    const whisperForm = new FormData();
    whisperForm.append("file", audioFile, audioFile.name || "audio.webm");
    whisperForm.append("model", "whisper-1");
    whisperForm.append("language", "es");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")!}` },
      body: whisperForm,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      console.error("Whisper error:", err);
      return jsonResponse({ error: "transcription_failed", message: err }, 502);
    }

    const { text: transcript } = await whisperRes.json() as { text: string };
    if (!transcript) return jsonResponse({ error: "empty_transcript" }, 422);

    // Step 2: Extract structured fields with Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        messages: [{ role: "user", content: buildExtractionPrompt(transcript, today) }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("Claude error:", err);
      return jsonResponse({ error: "extraction_failed", message: err, transcript }, 502);
    }

    const claudeJson = await claudeRes.json() as { content: Array<{ text: string }> };
    const rawText = claudeJson.content[0]?.text ?? "";

    let fields: unknown;
    try {
      // Strip potential markdown code fences before parsing
      const cleaned = rawText.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
      fields = JSON.parse(cleaned);
    } catch {
      return jsonResponse({ error: "parse_failed", transcript }, 422);
    }

    return jsonResponse({ fields, transcript });
  } catch (e) {
    console.error("finance-voice error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
```

- [ ] **Step 2: Register in `supabase/config.toml`**

Add at the end of the file (after the last `[functions.*]` block):

```toml
[functions.finance-voice]
verify_jwt = true
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/finance-voice/index.ts supabase/config.toml
git commit -m "feat(finance): finance-voice edge function (Whisper STT + Claude extraction)"
```

---

## Task 4: `VoiceFAB` component

**Files:**
- Create: `src/components/finance/VoiceFAB.tsx`

- [ ] **Step 1: Create `src/components/finance/VoiceFAB.tsx`**

```tsx
import { useState } from "react";
import { Mic, StopCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MultiTeacherSelect } from "@/components/finance/MultiTeacherSelect";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import {
  normalizeVoiceFields,
  validateVoiceForm,
  type VoiceExtracted,
} from "@/lib/finance/voice";
import { MONTHS } from "@/lib/finance/types";

const METHODS = [
  { value: "E", label: "E · Efectivo" },
  { value: "T", label: "T · Tarjeta" },
  { value: "B", label: "B · Bizum" },
  { value: "R", label: "R · Revolut" },
];

const STATUSES = [
  { value: "Pagado", label: "Pagado" },
  { value: "Pendiente", label: "Pendiente" },
];

function emptyForm(): VoiceExtracted {
  return {
    student_name: null,
    amount_cents: null,
    method: null,
    status: "Pagado",
    month: null,
    entry_date: null,
    item: null,
    category: null,
    collector: [],
    notes: null,
  };
}

export function VoiceFAB() {
  const { state, start, stop, error: recorderError } = useVoiceRecorder();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<VoiceExtracted>(emptyForm());
  const [amountEur, setAmountEur] = useState("");
  const [saving, setSaving] = useState(false);

  const handleFabClick = async () => {
    if (state === "idle") {
      await start();
      if (recorderError) toast.error(recorderError);
      return;
    }
    if (state === "recording") {
      const blob = await stop();
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const fd = new FormData();
        fd.append("audio", blob, "recording.webm");
        fd.append("today", new Date().toISOString().slice(0, 10));

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/finance-voice`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
            body: fd,
          },
        );

        const json = await res.json() as {
          fields?: unknown;
          transcript?: string;
          error?: string;
        };

        if (!res.ok || json.error) {
          if (json.error === "parse_failed") {
            toast.error("No se pudo interpretar el audio. Transcripción: " + (json.transcript ?? ""));
          } else {
            toast.error("Error al procesar el audio");
          }
          return;
        }

        const normalized = normalizeVoiceFields(json.fields);
        if (!normalized) {
          toast.error("Respuesta inesperada del servidor");
          return;
        }
        setForm(normalized);
        setAmountEur(normalized.amount_cents !== null ? (normalized.amount_cents / 100).toFixed(2) : "");
        setOpen(true);
      } catch {
        toast.error("Error de red al procesar el audio");
      }
    }
  };

  const handleConfirm = async () => {
    const finalForm: VoiceExtracted = {
      ...form,
      amount_cents: amountEur ? Math.round(parseFloat(amountEur) * 100) : null,
    };
    const errors = validateVoiceForm(finalForm);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("ledger_entries").insert({
      student_name: finalForm.student_name,
      amount_cents: finalForm.amount_cents,
      method: finalForm.method,
      status: finalForm.status,
      month: finalForm.month,
      entry_date: finalForm.entry_date,
      item: finalForm.item,
      category: finalForm.category,
      collector: finalForm.collector.length > 0 ? finalForm.collector : null,
      commission_pct_override: null,
      notes: finalForm.notes,
    });
    setSaving(false);
    if (error) {
      toast.error("Error al guardar: " + error.message);
      return;
    }
    toast.success("Ingreso guardado");
    setOpen(false);
    setForm(emptyForm());
    setAmountEur("");
  };

  const fabIcon = () => {
    if (state === "processing") return <Loader2 className="h-6 w-6 animate-spin" />;
    if (state === "recording") return <StopCircle className="h-6 w-6" />;
    return <Mic className="h-6 w-6" />;
  };

  const fieldBorder = (value: string | null | undefined) =>
    value == null ? "border-yellow-400" : "";

  return (
    <>
      <Button
        onClick={handleFabClick}
        disabled={state === "processing"}
        className={[
          "fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg",
          state === "recording" ? "bg-red-500 hover:bg-red-600 animate-pulse" : "",
        ].join(" ")}
        size="icon"
        aria-label={state === "recording" ? "Detener grabación" : "Registrar pago por voz"}
      >
        {fabIcon()}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); setForm(emptyForm()); setAmountEur(""); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar ingreso</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div>
              <Label>Alumna *</Label>
              <Input
                className={fieldBorder(form.student_name)}
                value={form.student_name ?? ""}
                onChange={(e) => setForm({ ...form, student_name: e.target.value || null })}
                placeholder="Nombre"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Importe (€) {form.status === "Pagado" && "*"}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className={fieldBorder(form.amount_cents !== null ? "ok" : null)}
                  value={amountEur}
                  onChange={(e) => setAmountEur(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Estado</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as "Pagado" | "Pendiente" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Método {form.status === "Pagado" && "*"}</Label>
                <Select
                  value={form.method ?? ""}
                  onValueChange={(v) => setForm({ ...form, method: v || null })}
                >
                  <SelectTrigger className={fieldBorder(form.method)}>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mes *</Label>
                <Select
                  value={form.month ?? ""}
                  onValueChange={(v) => setForm({ ...form, month: v || null })}
                >
                  <SelectTrigger className={fieldBorder(form.month)}>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Fecha *</Label>
              <Input
                type="date"
                className={fieldBorder(form.entry_date)}
                value={form.entry_date ?? ""}
                onChange={(e) => setForm({ ...form, entry_date: e.target.value || null })}
              />
            </div>

            <div>
              <Label>Concepto</Label>
              <Input
                value={form.item ?? ""}
                onChange={(e) => setForm({ ...form, item: e.target.value || null })}
                placeholder="Clase adultos, taller..."
              />
            </div>

            <div>
              <Label>Profesora(s)</Label>
              <MultiTeacherSelect
                value={form.collector}
                onChange={(v) => setForm({ ...form, collector: v })}
              />
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
                rows={2}
                placeholder="Observaciones..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setForm(emptyForm()); setAmountEur(""); }}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no new errors in `VoiceFAB.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/VoiceFAB.tsx
git commit -m "feat(finance): VoiceFAB component (FAB + confirmation dialog)"
```

---

## Task 5: Wire VoiceFAB into admin layout

**Files:**
- Modify: `src/routes/admin.tsx`

- [ ] **Step 1: Add `VoiceFAB` import and render in `admin.tsx`**

Open `src/routes/admin.tsx`. The file currently ends with:

```tsx
  return (
    <RouteGuard requireStaff>
      <AppShell brand="Cerámica Studio · Admin" items={items} />
    </RouteGuard>
  );
```

Make these two changes:

**Add import** at the top (after the existing imports):
```tsx
import { VoiceFAB } from "@/components/finance/VoiceFAB";
```

**Update return** to add `<VoiceFAB />` as a sibling inside the RouteGuard:
```tsx
  return (
    <RouteGuard requireStaff>
      <AppShell brand="Cerámica Studio · Admin" items={items} />
      <VoiceFAB />
    </RouteGuard>
  );
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/admin.tsx
git commit -m "feat(finance): wire VoiceFAB into admin layout (global FAB)"
```

---

## Task 6: Manual verification checklist

After deploying to Lovable (which auto-deploys on push to main):

- [ ] **Step 1: Confirm secrets are set in Lovable Secret Manager**
  - `OPENAI_API_KEY` → set ✓
  - `ANTHROPIC_API_KEY` → set ✓

- [ ] **Step 2: Open any admin page (e.g., `/admin`) — FAB visible bottom-right**

- [ ] **Step 3: Click FAB → browser asks mic permission → grant → button turns red + pulses**

- [ ] **Step 4: Say** *"Ana pagó hoy por este mes en efectivo veinte euros"* → click Stop

- [ ] **Step 5: Confirm dialog opens with:**
  - `student_name`: Ana
  - `amount`: 20.00 (or null if Whisper missed it — yellow border)
  - `method`: E
  - `status`: Pagado
  - `month`: current month (e.g. JUNIO)
  - `entry_date`: today's date

- [ ] **Step 6: Click Confirmar → toast "Ingreso guardado" → row appears in `/admin/registro`**

- [ ] **Step 7: Test error fallback — say gibberish / very short audio → confirm error toast appears, no crash**
