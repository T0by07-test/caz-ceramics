import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { withoutClosedDates } from "@/lib/closures";
import { createEnrollmentRequest } from "@/lib/requests";
import { startOfMonth, toIsoDate, DEFAULT_CALENDAR_MONTH } from "@/lib/calendar";
import { PublicClassCalendar, type UpcomingClass } from "@/components/PublicClassCalendar";
import { usePublicAvailability } from "@/hooks/usePublicAvailability";

import { z } from "zod";

const searchSchema = z.object({
  intent: z.enum(["prueba", "regular"]).optional().catch(undefined),
});

export const Route = createFileRoute("/solicitar")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Solicitar plaza — Cazú Ceramics" },
      {
        name: "description",
        content:
          "Solicita tu plaza en Cazú Ceramics. Elige las clases que te interesan y Cande te escribirá.",
      },
    ],
  }),
  component: SolicitarPage,
});

const PLAN_LINES = [
  "1 clase / mes — 30 €",
  "2 clases / mes — 55 €",
  "3 clases / mes — 70 €",
  "4 clases / mes — 85 €",
];

function SolicitarPage() {
  const { intent } = Route.useSearch();
  const isTrial = intent === "prueba";
  const isRegular = intent === "regular";
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [classes, setClasses] = useState<UpcomingClass[] | null>(null);
  const availability = usePublicAvailability();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [monthRef, setMonthRef] = useState<Date>(() => startOfMonth(DEFAULT_CALENDAR_MONTH));

  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const todayIso = toIsoDate(new Date());
      const { data, error } = await supabase
        .from("classes")
        .select("id, date, start_time, end_time, audience, teacher")
        .eq("status", "scheduled")
        .gte("date", todayIso)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(500);
      if (error) {
        toast.error("No se pudieron cargar las clases", { description: error.message });
        setClasses([]);
        return;
      }
      setClasses(withoutClosedDates((data ?? []) as UpcomingClass[]));
    })();
  }, []);

  // Group classes by date for the calendar picker.
  const byDate = useMemo(() => {
    const map = new Map<string, UpcomingClass[]>();
    for (const c of classes ?? []) {
      const arr = map.get(c.date) ?? [];
      arr.push(c);
      map.set(c.date, arr);
    }
    return map;
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
      <div className="mx-auto flex min-h-screen w-full max-w-[1180px] items-center justify-center px-4 py-24 sm:px-8">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-h2">¡Solicitud recibida!</CardTitle>
            <CardDescription>
              Hemos recibido tu solicitud. Cande la revisará y te escribirá para confirmar tu plaza.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
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
    <div className="mx-auto w-full max-w-[1180px] px-4 py-24 sm:px-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Cazú Ceramics
          </Link>
        </div>
        <Card className="">
          <CardHeader>
            <CardTitle className="text-h2">
              {isTrial
                ? "Reserva tu clase de prueba"
                : isRegular
                  ? "Elige tu frecuencia"
                  : "Solicitar plaza"}
            </CardTitle>
            <CardDescription>
              {isTrial ? (
                <>
                  Clase de prueba · 2 horas · 35 €
                  <br />
                  Todos los materiales y cocciones incluidos.
                  <br />
                  No necesitas experiencia previa.
                </>
              ) : isRegular ? (
                <>
                  Elige la frecuencia que mejor se adapte a tu ritmo, consulta los horarios y
                  reserva tus clases.
                </>
              ) : (
                <>
                  En Cazú Ceramics trabajamos en grupos reducidos, con atención personalizada
                  y&nbsp; con la calma que pide la cerámica. Solicita tu plaza y te confirmaremos.
                </>
              )}
            </CardDescription>
            {isRegular ? (
              <ul className="mt-3 grid gap-1.5 rounded-none border border-border bg-background p-3 text-sm sm:grid-cols-2">
                {PLAN_LINES.map((p) => (
                  <li key={p} className="tabular-nums">
                    {p}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="surname">Apellido</Label>
                  <Input
                    id="surname"
                    required
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
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

              <div className="flex flex-col gap-2">
                <Label>Clases que te interesan</Label>
                <p className="text-xs text-muted-foreground">
                  Marca al menos una. Cande confirmará la disponibilidad final.
                </p>
                <PublicClassCalendar
                  availability={availability}
                  monthRef={monthRef}
                  onMonthChange={(d) => {
                    setMonthRef(d);
                    setSelectedDay(null);
                  }}
                  byDate={byDate}
                  loading={classes === null}
                  selectedIds={selectedIds}
                  selectedDay={selectedDay}
                  onSelectDay={setSelectedDay}
                  onToggle={toggle}
                />
              </div>

              <div className="flex flex-col gap-2">
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
