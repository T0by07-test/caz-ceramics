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
import {
  ES_WEEKDAYS_SHORT,
  addMonths,
  buildMonthGrid,
  formatLongDate,
  formatMonthTitle,
  formatTimeRange,
  startOfMonth,
  toIsoDate,
} from "@/lib/calendar";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
  audience: "adults" | "kids";
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
  const [monthRef, setMonthRef] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const todayIso = toIsoDate(new Date());
      const { data, error } = await supabase
        .from("classes")
        .select("id, date, start_time, end_time, audience")
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
                <CalendarPicker
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

function CalendarPicker({
  monthRef,
  onMonthChange,
  byDate,
  loading,
  selectedIds,
  selectedDay,
  onSelectDay,
  onToggle,
}: {
  monthRef: Date;
  onMonthChange: (d: Date) => void;
  byDate: Map<string, UpcomingClass[]>;
  loading: boolean;
  selectedIds: Set<string>;
  selectedDay: string | null;
  onSelectDay: (iso: string | null) => void;
  onToggle: (id: string) => void;
}) {
  const cells = useMemo(() => buildMonthGrid(monthRef), [monthRef]);
  const todayIso = toIsoDate(new Date());
  const daySlots = selectedDay ? (byDate.get(selectedDay) ?? []) : [];

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Mes anterior"
          onClick={() => onMonthChange(addMonths(monthRef, -1))}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-semibold capitalize">
          {formatMonthTitle(monthRef)}
        </div>
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => onMonthChange(addMonths(monthRef, 1))}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {ES_WEEKDAYS_SHORT.map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      {loading ? (
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: 42 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted/40" />
          ))}
        </div>
      ) : (
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            const slots = byDate.get(cell.iso) ?? [];
            const has = slots.length > 0;
            const isPast = cell.iso < todayIso;
            const isSelected = selectedDay === cell.iso;
            const hasSelected = slots.some((s) => selectedIds.has(s.id));
            const disabled = !has || isPast;
            return (
              <button
                type="button"
                key={cell.iso}
                disabled={disabled}
                onClick={() => onSelectDay(isSelected ? null : cell.iso)}
                className={[
                  "relative flex h-12 flex-col items-center justify-center rounded-md border text-sm transition-colors",
                  !cell.inMonth ? "text-muted-foreground/50" : "",
                  disabled
                    ? "cursor-not-allowed border-transparent bg-transparent text-muted-foreground/40"
                    : isSelected
                      ? "border-primary bg-primary/10 text-foreground"
                      : hasSelected
                        ? "border-primary/40 bg-primary/5 text-foreground hover:bg-primary/10"
                        : "border-border bg-background hover:bg-muted/40",
                  cell.isToday && !isSelected ? "ring-1 ring-primary/40" : "",
                ].join(" ")}
              >
                <span className="tabular-nums leading-none">{cell.date.getDate()}</span>
                {has && !disabled ? (
                  <span
                    className={[
                      "mt-1 h-1.5 w-1.5 rounded-full",
                      hasSelected ? "bg-primary" : "bg-success",
                    ].join(" ")}
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 border-t border-border pt-3">
        {!selectedDay ? (
          <p className="text-xs text-muted-foreground">
            Toca un día con disponibilidad para ver los horarios.
          </p>
        ) : daySlots.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No hay horarios disponibles ese día.
          </p>
        ) : (
          <div>
            <div className="mb-2 text-xs font-semibold capitalize text-muted-foreground">
              {formatLongDate(selectedDay)}
            </div>
            <ul className="space-y-1.5">
              {daySlots.map((c) => {
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
        )}
      </div>
    </div>
  );
}
