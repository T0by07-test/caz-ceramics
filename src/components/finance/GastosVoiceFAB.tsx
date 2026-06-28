import { useState, useRef, useCallback, useEffect, useMemo } from "react";
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
import { tbl } from "@/lib/finance/db";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { MONTHS } from "@/lib/finance/types";

type GastoExtracted = {
  entry_date: string | null;
  month: string | null;
  category: string | null;
  concept: string | null;
  provider: string | null;
  amount_cents: number | null;
  vat_cents: number | null;
  method: string | null;
  notes: string | null;
};

const METHODS = [
  { value: "E", label: "E · Efectivo" },
  { value: "T", label: "T · Tarjeta" },
  { value: "B", label: "B · Bizum" },
  { value: "R", label: "R · Revolut" },
];

function emptyGasto(): GastoExtracted {
  return {
    entry_date: null,
    month: null,
    category: null,
    concept: null,
    provider: null,
    amount_cents: null,
    vat_cents: null,
    method: null,
    notes: null,
  };
}

function normalizeGasto(raw: unknown): GastoExtracted | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    entry_date: typeof r.entry_date === "string" ? r.entry_date : null,
    month: typeof r.month === "string" ? r.month.toUpperCase() : null,
    category: typeof r.category === "string" ? r.category : null,
    concept: typeof r.concept === "string" ? r.concept : null,
    provider: typeof r.provider === "string" ? r.provider : null,
    amount_cents: typeof r.amount_cents === "number" ? Math.round(r.amount_cents) : null,
    vat_cents: typeof r.vat_cents === "number" ? Math.round(r.vat_cents) : null,
    method: typeof r.method === "string" ? r.method.toUpperCase() : null,
    notes: typeof r.notes === "string" ? r.notes : null,
  };
}

function CategoryCombobox({
  value,
  onChange,
  known,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  known: string[];
}) {
  const [query, setQuery] = useState(value ?? "");

  useEffect(() => { setQuery(value ?? ""); }, [value]);

  const chips = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return known.slice(0, 6);
    return known.filter((c) => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 6);
  }, [query, known]);

  return (
    <div>
      <Input
        value={query}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          onChange(v || null);
        }}
        placeholder="Ej. Materiales, Alquiler, Horno / Cocción…"
      />
      {chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setQuery(c); onChange(c); }}
              className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs text-primary hover:bg-primary/20"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GastosVoiceFAB() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<GastoExtracted>(emptyGasto());
  const [amountEur, setAmountEur] = useState("");
  const [vatEur, setVatEur] = useState("");
  const [saving, setSaving] = useState(false);
  const [knownCategories, setKnownCategories] = useState<string[]>([]);
  const [knownConcepts, setKnownConcepts] = useState<string[]>([]);

  useEffect(() => {
    tbl("expense_entries")
      .select("category, concept")
      .then(({ data }: { data: { category: string | null; concept: string | null }[] | null }) => {
        const cats = [
          ...new Set((data ?? []).map((d) => d.category).filter(Boolean) as string[]),
        ].sort();
        const concepts = [
          ...new Set((data ?? []).map((d) => d.concept).filter(Boolean) as string[]),
        ].sort();
        setKnownCategories(cats);
        setKnownConcepts(concepts);
      });
  }, []);

  const resetRef = useRef(() => {});

  const closeDialog = useCallback(() => {
    setOpen(false);
    setForm(emptyGasto());
    setAmountEur("");
    setVatEur("");
    resetRef.current();
  }, []);

  const handleTranscript = useCallback(async (transcript: string) => {
    if (!transcript.trim()) {
      toast.error("No se detectó voz. Intenta de nuevo.");
      resetRef.current();
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Sesión expirada. Por favor, recarga la página.");
        resetRef.current();
        return;
      }
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/finance-voice`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transcript,
            today: new Date().toISOString().slice(0, 10),
            mode: "gasto",
            knownCategories,
            knownConcepts: knownConcepts.slice(0, 30),
          }),
        },
      );

      const json = await res.json() as { fields?: unknown; error?: string };

      if (!res.ok || json.error) {
        toast.error(
          json.error === "parse_failed"
            ? "No se pudo interpretar el audio. Añade el gasto manualmente."
            : "Error al procesar el audio",
        );
        resetRef.current();
        return;
      }

      const normalized = normalizeGasto(json.fields);
      if (!normalized) {
        toast.error("Respuesta inesperada del servidor");
        resetRef.current();
        return;
      }

      // Auto-compute VAT at 21% if AI didn't extract it
      const vat = normalized.vat_cents ??
        (normalized.amount_cents != null ? Math.round(normalized.amount_cents * 0.21) : null);
      const formWithVat = { ...normalized, vat_cents: vat };
      setForm(formWithVat);
      setAmountEur(normalized.amount_cents != null ? (normalized.amount_cents / 100).toFixed(2) : "");
      setVatEur(vat != null ? (vat / 100).toFixed(2) : "");
      setOpen(true);
    } catch {
      toast.error("Error de red al procesar el audio");
      resetRef.current();
    }
  }, [knownCategories, knownConcepts]);

  const { state, start, stop, reset, error: speechError } = useSpeechRecognition(handleTranscript);
  resetRef.current = reset;

  useEffect(() => {
    if (speechError) toast.error(speechError);
  }, [speechError]);

  const handleFabClick = () => {
    if (state === "idle") { start(); return; }
    if (state === "listening") { stop(); }
  };

  const handleConfirm = async () => {
    const amount_cents = amountEur
      ? Math.round(parseFloat(amountEur.replace(",", ".")) * 100)
      : null;
    const vat_cents = vatEur
      ? Math.round(parseFloat(vatEur.replace(",", ".")) * 100)
      : null;

    if (!form.month) { toast.error("Mes requerido"); return; }
    if (amount_cents == null || amount_cents < 0) { toast.error("Importe requerido"); return; }

    setSaving(true);
    const { error } = await tbl("expense_entries").insert({
      entry_date: form.entry_date,
      month: form.month,
      category: form.category,
      concept: form.concept,
      provider: form.provider,
      amount_cents,
      vat_cents,
      method: form.method,
      notes: form.notes,
    });
    setSaving(false);
    if (error) {
      toast.error("Error al guardar: " + error.message);
      return;
    }
    toast.success("Gasto guardado");
    window.dispatchEvent(new CustomEvent("expense:insert"));
    closeDialog();
  };

  const fabIcon = () => {
    if (state === "processing") return <Loader2 className="h-6 w-6 animate-spin" />;
    if (state === "listening") return <StopCircle className="h-6 w-6" />;
    return <Mic className="h-6 w-6" />;
  };

  return (
    <>
      <Button
        onClick={handleFabClick}
        disabled={state === "processing"}
        className={[
          "fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg",
          state === "listening" ? "bg-red-500 hover:bg-red-600 animate-pulse" : "",
        ].join(" ")}
        size="icon"
        aria-label={state === "listening" ? "Detener grabación" : "Registrar gasto por voz"}
      >
        {fabIcon()}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) closeDialog(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar gasto</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={form.entry_date ?? ""}
                  onChange={(e) => setForm({ ...form, entry_date: e.target.value || null })}
                />
              </div>
              <div>
                <Label>Mes *</Label>
                <Select
                  value={form.month ?? ""}
                  onValueChange={(v) => setForm({ ...form, month: v || null })}
                >
                  <SelectTrigger className={!form.month ? "border-yellow-400" : ""}>
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
              <Label>Categoría</Label>
              <CategoryCombobox
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
                known={knownCategories}
              />
            </div>

            <div>
              <Label>Concepto</Label>
              <Input
                value={form.concept ?? ""}
                onChange={(e) => setForm({ ...form, concept: e.target.value || null })}
                placeholder="Ej. Arcilla, Cocción tanda 1…"
              />
            </div>

            <div>
              <Label>Proveedor</Label>
              <Input
                value={form.provider ?? ""}
                onChange={(e) => setForm({ ...form, provider: e.target.value || null })}
                placeholder="Opcional"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Importe (€) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className={!amountEur ? "border-yellow-400" : ""}
                  value={amountEur}
                  onChange={(e) => {
                    setAmountEur(e.target.value);
                    const amt = parseFloat(e.target.value.replace(",", "."));
                    setVatEur(!isNaN(amt) ? (amt * 0.21).toFixed(2) : "");
                  }}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>IVA soportado (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={vatEur}
                  onChange={(e) => setVatEur(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <Label>Método</Label>
              <Select
                value={form.method ?? ""}
                onValueChange={(v) => setForm({ ...form, method: v || null })}
              >
                <SelectTrigger>
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
              <Label>Notas</Label>
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
                rows={2}
                placeholder="Observaciones…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
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
