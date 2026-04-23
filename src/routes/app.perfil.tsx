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
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-surface" />
        <div className="h-64 animate-pulse rounded-xl border border-border bg-surface" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <span className="text-label uppercase">Cuenta</span>
        <h1 className="text-h1 mt-1">Mi perfil</h1>
        <p className="text-body mt-2 text-muted-foreground">
          Actualiza tus datos y elige cómo prefieres recibir los avisos.
        </p>
      </div>

      <Card className="space-y-5 p-6">
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

      <Card className="space-y-4 p-6">
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
    </div>
  );
}