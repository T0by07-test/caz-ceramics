import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type Voucher = {
  id: string;
  recipients: string;
  buyer_name: string | null;
  buyer_contact: string | null;
  description: string | null;
  price_cents: number | null;
  is_paid: boolean;
  payment_method: string | null;
  purchase_date: string;
  is_redeemed: boolean;
  notes: string | null;
};

const euro = (c: number | null) =>
  c == null ? "—" : (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

const fmtDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

type Filter = "all" | "unpaid" | "unredeemed";

export function VouchersSection() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Voucher | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("vouchers")
      .select("*")
      .order("purchase_date", { ascending: false })
      .order("created_at", { ascending: false });
    setVouchers((data ?? []) as Voucher[]);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const shown = vouchers.filter((v) =>
    filter === "unpaid" ? !v.is_paid : filter === "unredeemed" ? !v.is_redeemed : true,
  );
  const totals = useMemo(() => {
    let paid = 0;
    let pending = 0;
    for (const v of vouchers) {
      if (v.is_paid) paid += v.price_cents ?? 0;
      else pending += v.price_cents ?? 0;
    }
    return { paid, pending };
  }, [vouchers]);

  return (
    <section className="rounded-none border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-h2">Vouchers / Tarjetas regalo</h2>
          <p className="text-xs text-muted-foreground">
            {vouchers.length} vouchers · Cobrado {euro(totals.paid)} · Pendiente {euro(totals.pending)}
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Nuevo voucher
        </Button>
      </div>
      <div className="mb-3 flex gap-2">
        {(
          [
            ["all", "Todos"],
            ["unpaid", "Sin cobrar"],
            ["unredeemed", "Sin usar"],
          ] as const
        ).map(([k, l]) => (
          <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>
            {l}
          </Button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay vouchers.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => {
                  setEditing(v);
                  setOpen(true);
                }}
                className="flex w-full flex-col gap-0.5 rounded-none border border-border bg-background p-3 text-left"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Para: {v.recipients}</span>
                  <span className="flex gap-1 text-xs">
                    <span
                      className={
                        v.is_paid
                          ? "rounded-sm bg-primary/15 px-1.5 py-0.5 text-primary"
                          : "rounded-sm bg-destructive/15 px-1.5 py-0.5 text-destructive"
                      }
                    >
                      {v.is_paid ? `Cobrado${v.payment_method ? " · " + v.payment_method : ""}` : "Pendiente de pago"}
                    </span>
                    {v.is_redeemed ? (
                      <span className="rounded-sm bg-muted px-1.5 py-0.5 text-muted-foreground">Usado</span>
                    ) : null}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {[
                    v.buyer_name ? `Encargado por ${v.buyer_name}` : null,
                    euro(v.price_cents),
                    fmtDate(v.purchase_date),
                    v.description,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <VoucherDialog
        open={open}
        voucher={editing}
        onOpenChange={setOpen}
        onSaved={() => {
          setOpen(false);
          void refresh();
        }}
      />
    </section>
  );
}

function VoucherDialog({
  open,
  voucher,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  voucher: Voucher | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const empty = {
    recipients: "",
    buyer_name: "",
    buyer_contact: "",
    description: "",
    price: "",
    is_paid: false,
    payment_method: "",
    purchase_date: new Date().toISOString().slice(0, 10),
    is_redeemed: false,
    notes: "",
  };
  const [f, setF] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF(
      voucher
        ? {
            recipients: voucher.recipients,
            buyer_name: voucher.buyer_name ?? "",
            buyer_contact: voucher.buyer_contact ?? "",
            description: voucher.description ?? "",
            price: voucher.price_cents != null ? (voucher.price_cents / 100).toString() : "",
            is_paid: voucher.is_paid,
            payment_method: voucher.payment_method ?? "",
            purchase_date: voucher.purchase_date,
            is_redeemed: voucher.is_redeemed,
            notes: voucher.notes ?? "",
          }
        : { ...empty, purchase_date: new Date().toISOString().slice(0, 10) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, voucher]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (!f.recipients.trim()) return toast.error("Pon el nombre de quien recibe el voucher.");
    setSaving(true);
    const row = {
      recipients: f.recipients.trim(),
      buyer_name: f.buyer_name.trim() || null,
      buyer_contact: f.buyer_contact.trim() || null,
      description: f.description.trim() || null,
      price_cents: f.price ? Math.round(parseFloat(f.price.replace(",", ".")) * 100) : null,
      is_paid: f.is_paid,
      payment_method: f.is_paid ? f.payment_method || null : null,
      purchase_date: f.purchase_date || new Date().toISOString().slice(0, 10),
      is_redeemed: f.is_redeemed,
      notes: f.notes.trim() || null,
    };
    const { error } = voucher
      ? await supabase.from("vouchers").update(row).eq("id", voucher.id)
      : await supabase.from("vouchers").insert(row);
    setSaving(false);
    if (error) return toast.error("No se pudo guardar el voucher.");
    toast.success("Voucher guardado.");
    onSaved();
  };

  const remove = async () => {
    if (!voucher || !confirm("¿Eliminar este voucher?")) return;
    const { error } = await supabase.from("vouchers").delete().eq("id", voucher.id);
    if (error) return toast.error("No se pudo eliminar.");
    toast.success("Voucher eliminado.");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{voucher ? "Editar voucher" : "Nuevo voucher"}</DialogTitle>
          <DialogDescription>Registro privado: solo tú lo ves.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Para quién es (persona/s que lo reciben)</Label>
            <Input value={f.recipients} onChange={set("recipients")} placeholder="Ej. Laura y Pablo" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>Quién lo encargó</Label>
              <Input value={f.buyer_name} onChange={set("buyer_name")} />
            </div>
            <div className="grid gap-1.5">
              <Label>Contacto</Label>
              <Input value={f.buyer_contact} onChange={set("buyer_contact")} placeholder="Teléfono / email" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Qué incluye</Label>
            <Input value={f.description} onChange={set("description")} placeholder="Ej. 4 clases, taller para 2…" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>Precio (€)</Label>
              <Input inputMode="decimal" value={f.price} onChange={set("price")} />
            </div>
            <div className="grid gap-1.5">
              <Label>Fecha de compra</Label>
              <Input type="date" value={f.purchase_date} onChange={set("purchase_date")} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.is_paid} onCheckedChange={(c) => setF((p) => ({ ...p, is_paid: c === true }))} />
            Está pagado
          </label>
          {f.is_paid ? (
            <div className="flex gap-2">
              {["Efectivo", "Tarjeta", "Bizum", "Transferencia"].map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={f.payment_method === m ? "default" : "outline"}
                  onClick={() => setF((p) => ({ ...p, payment_method: m }))}
                >
                  {m}
                </Button>
              ))}
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={f.is_redeemed}
              onCheckedChange={(c) => setF((p) => ({ ...p, is_redeemed: c === true }))}
            />
            Ya lo han usado
          </label>
          <div className="grid gap-1.5">
            <Label>Notas</Label>
            <Textarea value={f.notes} onChange={set("notes")} rows={3} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {voucher ? (
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
