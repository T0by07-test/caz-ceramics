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
  const { state, start, stop, reset, error: recorderError } = useVoiceRecorder();
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
        if (!session?.access_token) {
          toast.error("Sesión expirada. Por favor, recarga la página.");
          reset();
          return;
        }
        const fd = new FormData();
        fd.append("audio", blob, "recording.webm");
        fd.append("today", new Date().toISOString().slice(0, 10));

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/finance-voice`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}` },
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
          reset();
          return;
        }

        const normalized = normalizeVoiceFields(json.fields);
        if (!normalized) {
          toast.error("Respuesta inesperada del servidor");
          reset();
          return;
        }
        setForm(normalized);
        setAmountEur(normalized.amount_cents !== null ? (normalized.amount_cents / 100).toFixed(2) : "");
        setOpen(true);
      } catch {
        toast.error("Error de red al procesar el audio");
        reset();
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

      <Dialog open={open} onOpenChange={(v) => { if (!v && saving) return; if (!v) { setOpen(false); setForm(emptyForm()); setAmountEur(""); } }}>
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
