import { useState, useRef, useCallback, useEffect } from "react";
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
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
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
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<VoiceExtracted>(emptyForm());
  const [amountEur, setAmountEur] = useState("");
  const [saving, setSaving] = useState(false);

  // resetRef breaks the circular dep: handleTranscript needs reset, reset comes from the hook
  const resetRef = useRef(() => {});

  const closeDialog = useCallback(() => {
    setOpen(false);
    setForm(emptyForm());
    setAmountEur("");
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
          }),
        },
      );

      const json = await res.json() as {
        fields?: unknown;
        transcript?: string;
        error?: string;
      };

      if (!res.ok || json.error) {
        if (json.error === "parse_failed") {
          toast.error("No se pudo interpretar el audio. Añade el ingreso manualmente.");
        } else {
          toast.error("Error al procesar el audio");
        }
        resetRef.current();
        return;
      }

      const normalized = normalizeVoiceFields(json.fields);
      if (!normalized) {
        toast.error("Respuesta inesperada del servidor");
        resetRef.current();
        return;
      }
      setForm(normalized);
      setAmountEur(normalized.amount_cents !== null ? (normalized.amount_cents / 100).toFixed(2) : "");
      setOpen(true);
      // state stays "processing" (FAB disabled) while dialog is open; closeDialog() resets to idle
    } catch {
      toast.error("Error de red al procesar el audio");
      resetRef.current();
    }
  }, []);

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
    closeDialog();
  };

  const fabIcon = () => {
    if (state === "processing") return <Loader2 className="h-6 w-6 animate-spin" />;
    if (state === "listening") return <StopCircle className="h-6 w-6" />;
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
          state === "listening" ? "bg-red-500 hover:bg-red-600 animate-pulse" : "",
        ].join(" ")}
        size="icon"
        aria-label={state === "listening" ? "Detener grabación" : "Registrar pago por voz"}
      >
        {fabIcon()}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) closeDialog(); }}>
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
              <Label>Categoría</Label>
              <Input
                value={form.category ?? ""}
                onChange={(e) => setForm({ ...form, category: e.target.value || null })}
                placeholder="Ingreso, cuota..."
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
            <Button variant="outline" onClick={closeDialog}>
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
