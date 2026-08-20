import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { createTrialCheckout } from "@/lib/checkout";
import { startOfMonth, toIsoDate } from "@/lib/calendar";
import {
  PublicClassCalendar,
  type UpcomingClass,
} from "@/components/PublicClassCalendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/")({
  head: () => ({
      meta: [
        { title: "Cazú Ceramics — Clases de cerámica en un espacio acogedor" },
        {
          name: "description",
          content:
            "Solicita tu plaza en Cazú Ceramics. Clases de cerámica en grupos reducidos, atención personalizada y un ambiente cálido y artesanal.",
        },
        { property: "og:title", content: "Cazú Ceramics" },
      {
        property: "og:description",
        content: "Clases de cerámica en grupos reducidos. Solicita tu plaza.",
      },
    ],
  }),
  component: Index,
});

const STEPS = [
  {
    n: "01",
    title: "Si es tu primera vez",
    body: "Te explicamos cómo funcionan las clases y podrás elegir entre una clase de prueba o clases regulares. Si ya eres alumno/a regular, podrás elegir clases en los días y horarios que mejor se adapten a ti.",
  },
  {
    n: "02",
    title: "Reserva desde la plataforma",
    body: "Cada mes podrás reservar, cambiar o cancelar tus clases en el calendario. Igual para quien empieza como para quien ya es alumno/a regular.",
  },
];

const PLANS = [
  {
    classes: "1 clase",
    detail: "al mes",
    tagline: "Para empezar",
    description:
      "Una clase al mes para descubrir la cerámica y disfrutar del proceso sin compromiso.",
    price: "30 €",
    period: "/ mes",
  },
  {
    classes: "2 clases",
    detail: "al mes",
    description:
      "El equilibrio perfecto para mantener la cerámica en tu rutina.",
    price: "55 €",
    period: "/ mes",
  },
  {
    classes: "3 clases",
    detail: "al mes",
    tagline: "Para crear con más libertad",
    description:
      "Más tiempo para experimentar, avanzar en tus proyectos y aprender nuevas técnicas.",
    price: "70 €",
    period: "/ mes",
  },
  {
    classes: "4 clases",
    detail: "al mes",
    tagline: "Una clase cada semana",
    description:
      "La opción ideal si quieres hacer de la cerámica parte de tu rutina.",
    price: "85 €",
    period: "/ mes",
    featured: true,
    featuredLabel: "El más elegido",
  },
];

function Index() {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary" aria-hidden />
          <span className="text-h3">Cazú Ceramics</span>
        </div>
        <nav className="flex items-center gap-5">
          <Link
            to="/login"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Iniciar sesión
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pb-24 sm:px-8">
        {/* Hero */}
        <section className="mx-auto max-w-2xl pt-10 text-center sm:pt-16 lg:pt-24">
          <span className="text-label uppercase">Estudio de cerámica</span>
          <h1 className="text-h1 mt-3 text-foreground">
            Crea, aprende y disfruta del barro&nbsp;
            <br />a tu ritmo.
          </h1>
          <p className="text-body mt-5 text-muted-foreground">
            Un espacio para descubrir la cerámica, aprender nuevas técnicas y crear con tus propias manos. Clases para todos los niveles, grupos reducidos y&nbsp;
            <br />acompañamiento durante todo el proceso.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className="w-full sm:w-auto" onClick={() => setInfoOpen(true)}>
              Quiero información
            </Button>
            <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
              <Link to="/login">Ya soy alumno/a</Link>
            </Button>
          </div>

          <InfoDialog open={infoOpen} onOpenChange={setInfoOpen} />
        </section>

        {/* Cómo funciona */}
        <section className="mt-20 sm:mt-28">
          <div className="text-center">
            <h2 className="text-h2">¿Cómo funciona?</h2>
          </div>
          <ol className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="rounded-2xl border border-border bg-surface p-5 shadow-card"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {s.n}
                </span>
                <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Planes / precios */}
        <section className="mt-20 sm:mt-28">
          <div className="text-center">
            <h2 className="text-h2">Planes mensuales</h2>
            <p className="text-body mx-auto mt-3 max-w-xl text-muted-foreground">
              Elige cuántas clases quieres hacer en el mes.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((p) => (
              <div
                key={p.classes}
                className={[
                  "flex flex-col rounded-2xl border bg-surface p-5 shadow-card",
                  p.featured ? "border-primary ring-1 ring-primary/30" : "border-border",
                ].join(" ")}
              >
                {p.featured ? (
                  <span className="text-label uppercase text-primary">⭐ {p.featuredLabel}</span>
                ) : null}
                <div className={`flex items-baseline gap-1.5 ${p.featured ? "mt-2" : ""}`}>
                  <span className="text-h3">{p.classes}</span>
                  <span className="text-sm text-muted-foreground">{p.detail}</span>
                </div>
                {p.tagline ? (
                  <p className="mt-1 text-sm font-medium text-foreground">{p.tagline}</p>
                ) : null}
                <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-2xl font-semibold tabular-nums">{p.price}</span>
                  <span className="text-sm text-muted-foreground">{p.period}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-center">
            <p className="text-body text-foreground">
              ¿Quieres venir más de 4 veces al mes?
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Puedes añadir clases extra por 20 € cada una.
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-border bg-surface p-6 text-center shadow-card sm:p-8">
            <p className="text-body text-foreground">
              Tú eliges cuándo venir. Cada mes tienes un número de clases según el plan
              que elijas y puedes reservarlas desde el calendario según la disponibilidad.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Las clases no se acumulan de un mes a otro. Si no las usas, se reinician al
              comienzo del siguiente mes.
            </p>
            <div className="mt-6">
              <Button asChild size="lg">
                <Link to="/solicitar">Ver clases y horarios</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Política de cancelación */}
        <section className="mt-20 sm:mt-28">
          <div className="text-center">
            <span className="text-label uppercase">Cosas a tener en cuenta</span>
            <h2 className="text-h2 mt-2">Cancelaciones y recuperaciones</h2>
            <p className="text-body mx-auto mt-3 max-w-xl text-muted-foreground">
              Pagas por las clases del plan que elijas (1, 2, 3 o 4 al mes). Si no puedes
              asistir a alguna, esto es lo que necesitas saber.
            </p>
          </div>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <li className="rounded-2xl border border-border bg-surface p-5 shadow-card">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                01
              </span>
              <h3 className="mt-4 text-base font-semibold">Avisa con tiempo</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Cancela tu clase con al menos 12 horas de antelación para no perderla.
                Así podemos ofrecer tu plaza a alguien más.
              </p>
            </li>
            <li className="rounded-2xl border border-border bg-surface p-5 shadow-card">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                02
              </span>
              <h3 className="mt-4 text-base font-semibold">Recupera tu clase</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Si cancelas a tiempo, puedes reservar otro horario disponible dentro del
                mismo mes a través del calendario.
              </p>
            </li>
            <li className="rounded-2xl border border-border bg-surface p-5 shadow-card">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                03
              </span>
              <h3 className="mt-4 text-base font-semibold">
                Si cancelas tarde o no vienes
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Si cancelas con menos de 12 horas o no asistes sin avisar, esa clase se
                cuenta como utilizada y no se puede recuperar.
              </p>
            </li>
          </ol>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Las clases recuperadas deben usarse dentro del mismo mes natural. No se
            acumulan ni se trasladan al mes siguiente.
          </p>
        </section>

        {/* Closing CTA */}
        <section className="mt-20 text-center sm:mt-28">
          <h2 className="text-h2">¿List@ para empezar?</h2>
          <p className="text-body mx-auto mt-3 max-w-md text-muted-foreground">
            Cuéntanos qué horarios te vienen bien y encontraremos la opción que
            mejor encaje contigo.
          </p>
          <div className="mt-6">
            <Button asChild size="lg">
              <Link to="/solicitar">Ver clases y horarios</Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}

function InfoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto text-left sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-h3">Clases regulares de cerámica</DialogTitle>
          <DialogDescription>
            Son clases de modelado en cerámica, en grupos reducidos y para todos los
            niveles. No necesitas experiencia previa. 🤎
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          En las clases exploramos diferentes técnicas e ideas para crear tus propias
          piezas. Trabajamos con arcilla gres, un material resistente y duradero, y
          puedes crear tanto piezas funcionales como piezas decorativas.
        </p>

        <ul className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
          <li>
            <span aria-hidden>📍</span> <strong>Dónde:</strong> Taller Cazú Ceramics,
            Ruzafa, Valencia
          </li>
          <li>
            <span aria-hidden>⏰</span> <strong>Duración:</strong> 2 horas por clase
          </li>
          <li>
            <span aria-hidden>📅</span> <strong>Frecuencia:</strong> puedes elegir entre
            diferentes planes de 1 a 4 clases al mes, según el ritmo que quieras llevar.
          </li>
        </ul>

        <p className="text-sm text-muted-foreground">
          Todos los materiales y las cocciones en horno cerámico están incluidos.
        </p>

        <div className="mt-2 space-y-3">
          <h3 className="text-base font-semibold">¿Qué te gustaría hacer?</h3>

          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-semibold">
              <span aria-hidden>👐</span> Quiero probar una clase
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ven a conocer el estudio, experimentar con el barro y descubrir si la
              cerámica es para ti.
            </p>
            <TrialBooking />
          </div>

          <div className="rounded-xl border border-primary/40 bg-surface p-4">
            <p className="text-sm font-semibold">
              <span aria-hidden>🏺</span> Quiero empezar con clases regulares
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Elige el plan que mejor se adapte a tu ritmo y reserva tus clases según tu
              disponibilidad.
            </p>
            <Button asChild className="mt-3 w-full">
              <Link to="/solicitar" search={{ intent: "regular" }}>
                Ver horarios y reservar
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TrialBooking() {
  const [classes, setClasses] = useState<UpcomingClass[] | null>(null);
  const [monthRef, setMonthRef] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loadingPay, setLoadingPay] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, date, start_time, end_time, audience, teacher")
        .eq("status", "scheduled")
        .gte("date", toIsoDate(new Date()))
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(500);
      if (error) {
        toast.error("No se pudieron cargar las clases", { description: error.message });
        setClasses([]);
        return;
      }
      setClasses((data ?? []) as UpcomingClass[]);
    })();
  }, []);

  const byDate = useMemo(() => {
    const map = new Map<string, UpcomingClass[]>();
    for (const c of classes ?? []) {
      const arr = map.get(c.date) ?? [];
      arr.push(c);
      map.set(c.date, arr);
    }
    return map;
  }, [classes]);

  const selectedIds = useMemo(
    () => new Set(selectedId ? [selectedId] : []),
    [selectedId],
  );

  const handlePay = async () => {
    if (!selectedId) {
      toast.error("Elige un día y un horario para tu clase de prueba");
      return;
    }
    if (!name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      toast.error("Completa tu nombre y un correo válido");
      return;
    }
    setLoadingPay(true);
    try {
      const { url } = await createTrialCheckout({
        classId: selectedId,
        email: email.trim(),
        name: name.trim(),
        returnUrl: `${window.location.origin}/`,
      });
      window.location.href = url;
    } catch (err) {
      toast.error("No se pudo iniciar el pago", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoadingPay(false);
    }
  };

  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        Elige el día y la hora que te vengan bien (30 € · 2 h).
      </p>
      <PublicClassCalendar
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
        onToggle={(id) => setSelectedId((prev) => (prev === id ? null : id))}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="trial-name">Nombre</Label>
          <Input
            id="trial-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trial-email">Correo electrónico</Label>
          <Input
            id="trial-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <Button className="w-full" disabled={loadingPay} onClick={handlePay}>
        {loadingPay ? "Abriendo el pago…" : "Reservar y pagar 30 €"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Pago seguro con Stripe. Recibirás la confirmación por correo.
      </p>
    </div>
  );
}
