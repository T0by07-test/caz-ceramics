import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatLongDate, formatTimeRange } from "@/lib/calendar";

export type Workshop = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  client_name: string | null;
  attendees: number | null;
  price_cents: number | null;
  contact: string | null;
  notes: string | null;
};

export function useWorkshops(range: { start: string; end: string } | null, enabled: boolean) {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const start = range?.start;
  const end = range?.end;
  const refresh = useCallback(async () => {
    if (!enabled || !start || !end) return setWorkshops([]);
    const { data } = await supabase
      .from("workshops")
      .select("*")
      .gte("date", start)
      .lte("date", end)
      .order("date")
      .order("start_time");
    setWorkshops((data ?? []) as Workshop[]);
  }, [enabled, start, end]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { workshops, refresh };
}

const euro = (c: number | null) =>
  c == null ? "" : (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export function WorkshopList({
  workshops,
  onSelect,
  onCreate,
}: {
  workshops: Workshop[];
  onSelect: (w: Workshop) => void;
  onCreate: () => void;
}) {
  return (
    <section className="rounded-none border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-h2">Talleres</h2>
          <p className="text-xs text-muted-foreground">Solo los ves tú. Las alumnas no los ven.</p>
        </div>
        <Button variant="outline" onClick={onCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo taller
        </Button>
      </div>
      {workshops.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay talleres en este periodo.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {workshops.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => onSelect(w)}
                className="flex w-full flex-col rounded-none border border-accent-foreground/30 bg-accent p-3 text-left text-accent-foreground"
              >
                <span className="text-sm font-medium">{w.title}</span>
                <span className="text-xs capitalize">
                  {formatLongDate(w.date)} · {formatTimeRange(w.start_time, w.end_time)}
                </span>
                <span className="text-xs">
                  {[w.client_name, w.attendees ? `${w.attendees} personas` : null, euro(w.price_cents)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function WorkshopDialog({
  open,
  workshop,
  defaultDate,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  workshop: Workshop | null;
  defaultDate: string;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    date: "",
    start_time: "10:00",
    end_time: "12:00",
    title: "",
    client_name: "",
    attendees: "",
    price: "",
    contact: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF({
      date: workshop?.date ?? defaultDate,
      start_time: workshop?.start_time.slice(0, 5) ?? "10:00",
      end_time: workshop?.end_time.slice(0, 5) ?? "12:00",
      title: workshop?.title ?? "",
      client_name: workshop?.client_name ?? "",
      attendees: workshop?.attendees?.toString() ?? "",
      price: workshop?.price_cents != null ? (workshop.price_cents / 100).toString() : "",
      contact: workshop?.contact ?? "",
      notes: workshop?.notes ?? "",
    });
  }, [open, workshop, defaultDate]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (!f.title.trim() || !f.date) return toast.error("Pon al menos nombre y fecha.");
    if (f.end_time <= f.start_time) return toast.error("La hora de fin debe ser posterior.");
    setSaving(true);
    const row = {
      date: f.date,
      start_time: f.start_time,
      end_time: f.end_time,
      title: f.title.trim(),
      client_name: f.client_name.trim() || null,
      attendees: f.attendees ? parseInt(f.attendees, 10) : null,
      price_cents: f.price ? Math.round(parseFloat(f.price.replace(",", ".")) * 100) : null,
      contact: f.contact.trim() || null,
      notes: f.notes.trim() || null,
    };
    const { error } = workshop
      ? await supabase.from("workshops").update(row).eq("id", workshop.id)
      : await supabase.from("workshops").insert(row);
    setSaving(false);
    if (error) return toast.error("No se pudo guardar el taller.");
    toast.success("Taller guardado.");
    onSaved();
  };

  const remove = async () => {
    if (!workshop || !confirm("¿Eliminar este taller?")) return;
    const { error } = await supabase.from("workshops").delete().eq("id", workshop.id);
    if (error) return toast.error("No se pudo eliminar.");
    toast.success("Taller eliminado.");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{workshop ? "Editar taller" : "Nuevo taller"}</DialogTitle>
          <DialogDescription>Registro privado: solo tú lo ves en el calendario.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nombre del taller</Label>
            <Input value={f.title} onChange={set("title")} placeholder="Ej. Despedida de soltera" />
          </div>
          <div className="grid gap-1.5">
            <Label>Cliente</Label>
            <Input value={f.client_name} onChange={set("client_name")} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={f.date} onChange={set("date")} />
            </div>
            <div className="grid gap-1.5">
              <Label>Inicio</Label>
              <Input type="time" value={f.start_time} onChange={set("start_time")} />
            </div>
            <div className="grid gap-1.5">
              <Label>Fin</Label>
              <Input type="time" value={f.end_time} onChange={set("end_time")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>Personas</Label>
              <Input type="number" min={1} value={f.attendees} onChange={set("attendees")} />
            </div>
            <div className="grid gap-1.5">
              <Label>Precio (€)</Label>
              <Input inputMode="decimal" value={f.price} onChange={set("price")} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Contacto (teléfono / email)</Label>
            <Input value={f.contact} onChange={set("contact")} />
          </div>
          <div className="grid gap-1.5">
            <Label>Notas</Label>
            <Textarea value={f.notes} onChange={set("notes")} rows={3} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {workshop ? (
            <Button variant="destructive" onClick={remove} disabled={saving}>
              Eliminar
            </Button>
          ) : null}
          <Button onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
