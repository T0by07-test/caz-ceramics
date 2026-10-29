import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Flame } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FIRING_SIZES, emptyFiringQuantities, firingTotals, type FiringQuantities } from "@/lib/firings";
import { toIsoDate } from "@/lib/calendar";
import type { Database } from "@/integrations/supabase/types";

type FiringOrder = Database["public"]["Tables"]["firing_orders"]["Row"];
const euro = (cents: number) => (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const queryKey = ["admin-firing-orders"];

export function FiringsSection() {
  const queryClient = useQueryClient();
  const { data: orders = [], isPending, isError, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("firing_orders").select("*").order("received_date", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FiringOrder | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState(toIsoDate(new Date()));
  const [quantities, setQuantities] = useState<FiringQuantities>(emptyFiringQuantities);
  const [paid, setPaid] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "unpaid">("all");
  const totals = firingTotals(quantities);
  const paidTotal = orders.filter((order) => order.is_paid).reduce((sum, order) => sum + (order.total_cents ?? 0), 0);
  const pendingTotal = orders.filter((order) => !order.is_paid).reduce((sum, order) => sum + (order.total_cents ?? 0), 0);
  const openOrder = (order: FiringOrder | null) => {
    setEditing(order);
    setName(order?.customer_name ?? "");
    setDate(order?.received_date ?? toIsoDate(new Date()));
    setQuantities(order ? { extra_small: order.extra_small, small: order.small, medium: order.medium, large: order.large, extra_large: order.extra_large } : emptyFiringQuantities());
    setPaid(order?.is_paid ?? false);
    setNotes(order?.notes ?? "");
    setOpen(true);
  };
  const saved = async () => {
    setOpen(false);
    await queryClient.invalidateQueries({ queryKey });
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !date || totals.pieces === 0) return toast.error("Indica la persona, la fecha y al menos una pieza.");
    setSaving(true);
    try {
      const row = { customer_name: name.trim(), received_date: date, ...quantities, is_paid: paid, notes: notes.trim() };
      const { error } = editing ? await supabase.from("firing_orders").update(row).eq("id", editing.id) : await supabase.from("firing_orders").insert(row);
      if (error) throw error;
      toast.success("Cocción guardada.");
      await saved();
    } catch { toast.error("No se pudo guardar la cocción."); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!editing || !window.confirm("¿Eliminar este registro de cocción?")) return;
    setSaving(true);
    const { error } = await supabase.from("firing_orders").delete().eq("id", editing.id);
    if (error) toast.error("No se pudo eliminar la cocción.");
    else { toast.success("Cocción eliminada."); await saved(); }
    setSaving(false);
  };

  return (
    <section className="border-t border-border pt-6" aria-label="Cocciones">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-h2 flex items-center gap-2"><Flame className="h-5 w-5 text-primary" /> Cocciones</h2>
          <p className="text-sm text-muted-foreground">{orders.reduce((sum, order) => sum + firingTotals(order).pieces, 0)} piezas · Cobrado {euro(paidTotal)} · Pendiente {euro(pendingTotal)}</p>
        </div>
        <Button variant="outline" onClick={() => openOrder(null)} className="gap-2"><Plus className="h-4 w-4" /> Nueva cocción</Button>
      </div>
      <div className="my-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
        {FIRING_SIZES.map((size) => <span key={size.key}>{size.label}: {euro(size.cents)}</span>)}
        <span className="w-full">Por pieza · Incluye bizcocho y esmalte</span>
      </div>
      <div className="mb-3 flex gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>Todas</Button>
        <Button size="sm" variant={filter === "unpaid" ? "default" : "outline"} onClick={() => setFilter("unpaid")}>Sin cobrar</Button>
      </div>
      {isPending ? <p className="text-sm text-muted-foreground">Cargando cocciones…</p> : isError ? <div className="flex items-center gap-3"><p>No se pudieron cargar las cocciones.</p><Button variant="outline" onClick={() => void refetch()}>Reintentar</Button></div> : (
        <ul className="divide-y divide-border">
          {orders.filter((order) => filter === "all" || !order.is_paid).map((order) => (
            <li key={order.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0"><p className="break-words font-medium">{order.customer_name} · {euro(order.total_cents ?? 0)}</p>
                <p className="text-sm text-muted-foreground">{new Date(order.received_date + "T12:00:00").toLocaleDateString("es-ES")} · {firingTotals(order).pieces} piezas · {order.is_paid ? "Cobrado" : "Pendiente"}</p>
                <p className="text-xs text-muted-foreground">{FIRING_SIZES.filter((size) => order[size.key] > 0).map((size) => `${size.label}: ${order[size.key]}`).join(" · ")}</p>
                {order.notes ? <p className="mt-1 break-words text-sm text-muted-foreground">{order.notes}</p> : null}
              </div>
              <Button size="icon" variant="ghost" title={`Editar cocción de ${order.customer_name}`} aria-label={`Editar cocción de ${order.customer_name}`} onClick={() => openOrder(order)}><Pencil className="h-4 w-4" /></Button>
            </li>
          ))}
          {orders.filter((order) => filter === "all" || !order.is_paid).length === 0 ? <li className="py-3 text-sm text-muted-foreground">No hay cocciones{filter === "unpaid" ? " pendientes" : " registradas"}.</li> : null}
        </ul>
      )}
      <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar cocción" : "Nueva cocción"}</DialogTitle><DialogDescription>Tarifas por pieza, con bizcocho y esmalte incluidos.</DialogDescription></DialogHeader>
          <form onSubmit={save} className="grid gap-4">
            <div className="grid gap-1.5"><Label htmlFor="firing-name">Nombre de la persona</Label><Input id="firing-name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="firing-date">Fecha de entrega</Label><Input id="firing-date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></div>
            <div className="grid gap-3">
              {FIRING_SIZES.map((size) => <div key={size.key} className="grid grid-cols-[minmax(0,1fr)_80px_80px] items-center gap-2">
                <Label htmlFor={`firing-${size.key}`} className="leading-5">{size.label}<span className="block text-xs text-muted-foreground">{euro(size.cents)} / pieza</span></Label>
                <Input id={`firing-${size.key}`} aria-label={`Cantidad ${size.label.toLowerCase()}`} type="number" min={0} max={10000} step={1} value={quantities[size.key]} onChange={(event) => { const value = Number(event.target.value); if (Number.isSafeInteger(value) && value >= 0 && value <= 10000) setQuantities((previous) => ({ ...previous, [size.key]: value })); }} />
                <span className="text-right text-sm tabular-nums">{euro(quantities[size.key] * size.cents)}</span>
              </div>)}
            </div>
            <div className="flex justify-between border-t border-border pt-3 font-medium" aria-live="polite"><span>{totals.pieces} piezas · Total</span><span>{euro(totals.cents)}</span></div>
            <div className="flex items-center gap-2"><Checkbox id="firing-paid" checked={paid} onCheckedChange={(value) => setPaid(value === true)} /><Label htmlFor="firing-paid">Está pagado</Label></div>
            <div className="grid gap-1.5"><Label htmlFor="firing-notes">Notas / medidas aproximadas</Label><Textarea id="firing-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} /></div>
            <DialogFooter className="gap-2">{editing ? <Button type="button" variant="destructive" disabled={saving} onClick={() => void remove()} className="gap-2"><Trash2 className="h-4 w-4" /> Eliminar</Button> : null}<Button type="button" variant="ghost" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving || totals.pieces === 0}>{saving ? "Guardando…" : "Guardar"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}