import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type Pref = "both" | "email_only" | "whatsapp_only";

type PaymentRow = {
  id: string;
  amount_cents: number;
  status: string;
  method: string | null;
  created_at: string;
  booking_id: string | null;
  subscription_id: string | null;
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Pagado",
  failed: "No completado",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  bizum: "Bizum",
};

export const Route = createFileRoute("/app/perfil")({
  head: () => ({ meta: [{ title: "Mi perfil — Cerámica Studio" }] }),
  component: PerfilPage,
});

function PerfilPage() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [pref, setPref] = useState<Pref>("both");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("name, surname, whatsapp, notification_preference")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error("No se pudo cargar tu perfil");
      } else if (data) {
        setName(data.name ?? "");
        setSurname(data.surname ?? "");
        setWhatsapp(data.whatsapp ?? "");
        setPref((data.notification_preference as Pref) ?? "both");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("payments")
        .select("id, amount_cents, status, method, created_at, booking_id, subscription_id")
        .order("created_at", { ascending: false })
        .limit(20);
      if (!cancelled) setPayments((data ?? []) as PaymentRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        name: name.trim() || null,
        surname: surname.trim() || null,
        whatsapp: whatsapp.trim() || null,
        notification_preference: pref,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error("No se pudo guardar", { description: error.message });
    } else {
      toast.success("Perfil actualizado");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-8 w-48 animate-pulse rounded bg-surface" />
        <div className="h-64 animate-pulse rounded-none border border-border bg-surface" />
      </div>
    );
  }

  return (
    <div className="flex flex-col mx-auto max-w-xl gap-6">
      <div>
        <span className="text-label">Cuenta</span>
        <h1 className="text-h1 mt-1">Mi perfil</h1>
        <p className="text-body mt-2 text-muted-foreground">
          Actualiza tus datos y elige cómo prefieres recibir los avisos.
        </p>
      </div>

      <Card className="flex flex-col gap-6 p-6">
        <div className="grid gap-2">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="surname">Apellidos</Label>
          <Input id="surname" value={surname} onChange={(e) => setSurname(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="whatsapp">WhatsApp (con prefijo, ej. +34600000000)</Label>
          <Input
            id="whatsapp"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+34600000000"
            inputMode="tel"
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-h3">Recibir avisos por</h2>
          <p className="text-label mt-1 uppercase">
            Confirmaciones, recordatorios y recuperaciones
          </p>
        </div>
        <RadioGroup value={pref} onValueChange={(v) => setPref(v as Pref)} className="gap-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary">
            <RadioGroupItem value="both" id="pref-both" />
            <span className="text-sm font-medium">Email y WhatsApp</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary">
            <RadioGroupItem value="email_only" id="pref-email" />
            <span className="text-sm font-medium">Solo Email</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary">
            <RadioGroupItem value="whatsapp_only" id="pref-whatsapp" />
            <span className="text-sm font-medium">Solo WhatsApp</span>
          </label>
        </RadioGroup>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>

      <Card className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-h3">Mis pagos</h2>
          <p className="text-label mt-1 uppercase">Últimos movimientos</p>
        </div>
        {payments === null ? (
          <div className="h-16 animate-pulse rounded-lg bg-background" />
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no tienes pagos registrados.</p>
        ) : (
          <ul className="divide-y divide-border">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {p.subscription_id ? "Plan mensual" : "Clase suelta"}
                    {p.method ? ` · ${PAYMENT_METHOD_LABEL[p.method] ?? p.method}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-normal tabular-nums">
                    {(p.amount_cents / 100).toLocaleString("es-ES", {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
