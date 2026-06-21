import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { createEnrollmentRequest } from "@/lib/requests";
import { formatLongDate, formatTimeRange, toIsoDate } from "@/lib/calendar";

export const Route = createFileRoute("/solicitar")({
  head: () => ({
    meta: [
      { title: "Solicitar plaza — Cazu Ceramics" },
      {
        name: "description",
        content:
          "Solicita tu plaza en Cazu Ceramics. Elige las clases que te interesan y Cande te escribirá.",
      },
    ],
  }),
  component: SolicitarPage,
});

type UpcomingClass = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
};

function SolicitarPage() {
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [classes, setClasses] = useState<UpcomingClass[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void (async () => {
      const todayIso = toIsoDate(new Date());
      const { data, error } = await supabase
        .from("classes")
        .select("id, date, start_time, end_time")
        .eq("status", "scheduled")
        .gte("date", todayIso)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(60);
      if (error) {
        toast.error("No se pudieron cargar las clases", { description: error.message });
        setClasses([]);
        return;
      }
      setClasses((data ?? []) as UpcomingClass[]);
    })();
  }, []);

  // Group classes by date for a tidier picker.
  const grouped = useMemo(() => {
    const map = new Map<string, UpcomingClass[]>();
    for (const c of classes ?? []) {
      const arr = map.get(c.date) ?? [];
      arr.push(c);
      map.set(c.date, arr);
    }
    return Array.from(map.entries());
  }, [classes]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size === 0) {
      toast.error("Elige al menos una clase", {
        description: "Marca las clases que te interesan para enviar la solicitud.",
      });
      return;
    }
    setSubmitting(true);
    try {
      await createEnrollmentRequest({
        name: name.trim(),
        surname: surname.trim(),
        email: email.trim(),
        whatsapp: whatsapp.trim(),
        message: message.trim(),
        classIds: Array.from(selectedIds),
      });
      setDone(true);
    } catch (err) {
      toast.error("No se pudo enviar la solicitud", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
        <Card className="w-full max-w-md text-center shadow-card">
          <CardHeader>
            <CardTitle className="text-h2">¡Solicitud recibida!</CardTitle>
            <CardDescription>
              Hemos recibido tu solicitud. Cande la revisará y te escribirá para
              confirmar tu plaza.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full" size="lg">
              <Link to="/">Volver al inicio</Link>
            </Button>
            <Button asChild variant="secondary" className="w-full" size="lg">
              <Link to="/login">Ya tengo cuenta</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-5 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Cazu Ceramics
          </Link>
        </div>
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-h2">Solicitar plaza</CardTitle>
            <CardDescription>
              Déjanos tus datos y elige las clases que te interesan. Cande revisará tu
              solicitud y te escribirá.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="surname">Apellido</Label>
                  <Input
                    id="surname"
                    required
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  type="tel"
                  placeholder="+34 600 000 000"
                  required
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Clases que te interesan</Label>
                <p className="text-xs text-muted-foreground">
                  Marca al menos una. Cande confirmará la disponibilidad final.
                </p>
                <ClassPicker
                  grouped={grouped}
                  loading={classes === null}
                  selectedIds={selectedIds}
                  onToggle={toggle}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="message">Mensaje (opcional)</Label>
                <Textarea
                  id="message"
                  rows={3}
                  placeholder="Cuéntanos tu experiencia o lo que buscas…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                {submitting ? "Enviando…" : "Enviar solicitud"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                ¿Ya tienes cuenta?{" "}
                <Link to="/login" className="font-medium text-primary hover:underline">
                  Iniciar sesión
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ClassPicker({
  grouped,
  loading,
  selectedIds,
  onToggle,
}: {
  grouped: [string, UpcomingClass[]][];
  loading: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-lg border border-border bg-surface"
          />
        ))}
      </div>
    );
  }
  if (grouped.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-center text-sm text-muted-foreground">
        No hay clases programadas por ahora. Déjanos tu mensaje y te avisamos.
      </div>
    );
  }
  return (
    <div className="max-h-72 space-y-4 overflow-y-auto rounded-lg border border-border bg-surface p-3">
      {grouped.map(([date, items]) => (
        <div key={date}>
          <div className="mb-1.5 text-xs font-semibold capitalize text-muted-foreground">
            {formatLongDate(date)}
          </div>
          <ul className="space-y-1.5">
            {items.map((c) => {
              const checked = selectedIds.has(c.id);
              return (
                <li key={c.id}>
                  <label
                    className={[
                      "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                      checked
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/40",
                    ].join(" ")}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onToggle(c.id)}
                    />
                    <span className="tabular-nums">
                      {formatTimeRange(c.start_time, c.end_time)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
