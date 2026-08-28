import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { withoutClosedDates } from "@/lib/closures";
import { createTrialCheckout } from "@/lib/checkout";
import { startOfMonth, toIsoDate, DEFAULT_CALENDAR_MONTH } from "@/lib/calendar";
import { PublicClassCalendar, type UpcomingClass } from "@/components/PublicClassCalendar";

import logoAsset from "@/assets/logo-cazu-v2.png.asset.json";
import piezasCrudasAsset from "@/assets/piezas-crudas.jpg.asset.json";
import tazasCrudasAsset from "@/assets/tazas-crudas.jpg.asset.json";
import piezasBlancoTerracotaAsset from "@/assets/piezas-blanco-terracota.jpg.asset.json";
import bolTerracotaAsset from "@/assets/bol-terracota.jpg.asset.json";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
      "Una clase al mes para descubrir la cerámica y disfrutar del proceso, sin compromiso.",
    price: "30 €",
    period: "/mes",
    trialNote:
      "¿Solo quieres probar una clase? La clase de prueba de un día tiene un precio de 35 €.",
  },
  {
    classes: "2 clases",
    detail: "al mes",
    tagline: "Para mantener la práctica",
    description: "El equilibrio perfecto para mantener la cerámica en tu rutina.",
    price: "55 €",
    period: "/mes",
  },
  {
    classes: "3 clases",
    detail: "al mes",
    tagline: "Para crear con más libertad",
    description:
      "Más tiempo para experimentar, avanzar en tus proyectos y aprender nuevas técnicas.",
    price: "70 €",
    period: "/mes",
  },
  {
    classes: "4 clases",
    detail: "al mes",
    tagline: "Para hacer de la cerámica parte de tu rutina",
    description:
      "La opción ideal si quieres venir con frecuencia y aprovechar al máximo tu práctica.",
    price: "85 €",
    period: "/mes",
    featured: true,
    featuredLabel: "El más elegido",
  },
];

const SCHEDULE = [
  {
    day: "Lunes",
    slots: [
      "17:00 a 18:00 — clases de niños (1 h) · Profe Sofi",
      "18:30 a 20:30 — adultos · Profe Sofi",
    ],
  },
  { day: "Martes", slots: ["18:30 a 20:30 — adultos · Profe Cande"] },
  {
    day: "Miércoles",
    slots: [
      "10:30 a 12:30 — adultos · Profe Cande",
      "15:00 a 17:00 — adultos · Profe Cande",
      "18:30 a 20:30 — adultos · Profe Cande",
    ],
  },
  {
    day: "Jueves",
    slots: ["16:00 a 18:00 — adultos · Profe Cande", "18:30 a 20:30 — adultos · Profe Cande"],
  },
  {
    day: "Viernes",
    slots: ["10:30 a 12:30 — adultos · Profe Cande", "17:30 a 19:30 — adultos · Profe Sofi"],
  },
];

function Index() {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-4 py-5 sm:px-8">
          <img src={logoAsset.url} alt="Cazú Ceramics" className="h-14 w-auto shrink-0 sm:h-16" />
          <nav className="flex items-center gap-8">
            <Link
              to="/login"
              className="font-display text-[13px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
            >
              Iniciar sesión
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-4 sm:px-8">
        {/* Hero */}
        <section className="flex flex-col items-center gap-8 pb-12 pt-8 text-center">
          <span className="text-label">ESTUDIO DE CERÁMICA - RUZAFA</span>
          <div className="flex max-w-3xl flex-col gap-6">
            <h1 className="text-h1">Crea, aprende y disfruta del barro a tu ritmo.</h1>
            <p className="text-body mx-auto max-w-xl">
              Un espacio para descubrir la cerámica, aprender nuevas técnicas y crear con tus
              propias manos. Clases para todos los niveles, grupos reducidos y acompañamiento
              durante todo el proceso.
            </p>
          </div>

          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Button className="w-full sm:w-auto" onClick={() => setInfoOpen(true)}>
              Quiero información
            </Button>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link to="/login">Ya soy alumno/a</Link>
            </Button>
          </div>

          <InfoDialog open={infoOpen} onOpenChange={setInfoOpen} />
        </section>

        {/* Piezas del taller */}
        <figure className="pb-12">
          <img
            src={piezasCrudasAsset.url}
            alt="Platos, bols y tazas de cerámica sin esmaltar secándose en el taller"
            loading="lazy"
            className="aspect-[4/3] w-full object-cover sm:aspect-[16/10]"
          />
        </figure>

        {/* Cómo funciona */}
        <section className="flex flex-col gap-10 border-t border-border pb-12 pt-8">
          <h2 className="text-h2">¿Cómo funciona?</h2>
          <ol className="grid gap-10 sm:grid-cols-2">
            {STEPS.map((s) => (
              <li key={s.n} className="flex flex-col gap-3 border-t border-border pt-6">
                <span className="text-label">{s.n}</span>
                <h3 className="text-h3">{s.title}</h3>
                <p className="text-body">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Planes / precios */}
        <section className="flex flex-col gap-10 border-t border-border pb-12 pt-8">
          <div className="flex flex-col gap-4">
            <h2 className="text-h2">Planes mensuales</h2>
            <p className="text-body max-w-xl">
              Elige cuántas clases quieres hacer al mes y organiza tus clases según tu
              disponibilidad.
            </p>
            <p className="text-body max-w-xl">
              Todos los planes te permiten elegir libremente los días y horarios disponibles al
              reservar tus clases.
            </p>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Precio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PLANS.map((p) => (
                <TableRow key={p.classes}>
                  <TableCell className="py-2.5 align-middle">
                    <span className="items-baseline gap-2">
                      <span className="text-h3">{p.classes}</span>{" "}
                      <span className="text-label">{p.detail}</span>
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 text-right align-middle whitespace-nowrap">
                    <span className="font-display text-[20px] font-extralight tabular-nums tracking-[0.02em] text-foreground">
                      {p.price}
                    </span>{" "}
                    <span className="text-label">{p.period}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-col gap-3 border-t border-border pt-6">
            <h3 className="text-h3">¿Quieres venir más de 4 veces al mes?</h3>
            <p className="text-body">Puedes añadir clases extra por 20 € cada una.</p>
          </div>
        </section>

        {/* Horarios y profesoras */}
        <section className="flex flex-col gap-10 border-t border-border pb-12 pt-8">
          <div className="flex flex-col gap-4">
            <span className="text-label">Horarios y profesoras</span>
            <h2 className="text-h2">¿Cuándo se imparten las clases?</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Día</TableHead>
                <TableHead>Horario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SCHEDULE.flatMap((d) =>
                d.slots.map((slot, i) => (
                  <TableRow key={`${d.day}-${slot}`}>
                    {i === 0 ? (
                      <TableCell rowSpan={d.slots.length} className="align-top text-label">
                        {d.day}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-body">{slot}</TableCell>
                  </TableRow>
                )),
              )}
            </TableBody>
          </Table>

          <div className="flex flex-col gap-3 border-t border-border pt-6">
            <p className="text-body max-w-2xl">
              ¿Sois un grupo de 3 o más personas y queréis hacer una clase de cerámica durante la
              semana? Escríbeme por WhatsApp y coordinamos un día y horario que os venga bien.
            </p>
            <a
              href="https://wa.me/34661499026"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 font-display text-[13px] uppercase tracking-[0.16em] text-primary underline-offset-8 hover:underline"
            >
              <MessageCircle className="h-4 w-4 shrink-0" />
              +34 661 499 026
            </a>
          </div>
        </section>

        {/* Galería: piezas del taller */}
        <div className="grid grid-cols-1 gap-4 pb-12 sm:grid-cols-2 sm:gap-8">
          <figure>
            <img
              src={tazasCrudasAsset.url}
              alt="Tazas y bols de cerámica sin esmaltar vistos desde arriba"
              loading="lazy"
              className="aspect-[4/5] w-full object-cover"
            />
          </figure>
          <figure>
            <img
              src={piezasBlancoTerracotaAsset.url}
              alt="Piezas de cerámica en barro blanco y terracota secándose en el taller"
              loading="lazy"
              className="aspect-[4/5] w-full object-cover"
            />
          </figure>
        </div>

        {/* Política de cancelación */}
        <section className="flex flex-col gap-10 border-t border-border pb-12 pt-8">
          <div className="flex flex-col gap-4">
            <span className="text-label">Cosas a tener en cuenta</span>
            <h2 className="text-h2">Cancelaciones y recuperaciones</h2>
            <p className="text-body max-w-xl">
              Pagas por las clases del plan que elijas (1, 2, 3 o 4 al mes). Si no puedes asistir a
              alguna, esto es lo que necesitas saber.
            </p>
          </div>
          <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            <li className="flex flex-col gap-3 border-t border-border pt-6">
              <span className="text-label">01</span>
              <h3 className="text-h3">Avisa con tiempo</h3>
              <p className="text-body">
                Cancela tu clase con al menos 12 horas de antelación para no perderla. Así podemos
                ofrecer tu plaza a alguien más.
              </p>
            </li>
            <li className="flex flex-col gap-3 border-t border-border pt-6">
              <span className="text-label">02</span>
              <h3 className="text-h3">Recupera tu clase</h3>
              <p className="text-body">
                Si cancelas a tiempo, puedes reservar otro horario disponible dentro del mismo mes a
                través del calendario.
              </p>
            </li>
            <li className="flex flex-col gap-3 border-t border-border pt-6">
              <span className="text-label">03</span>
              <h3 className="text-h3">Si cancelas tarde o no vienes</h3>
              <p className="text-body">
                Si cancelas con menos de 12 horas o no asistes sin avisar, esa clase se cuenta como
                utilizada y no se puede recuperar.
              </p>
            </li>
          </ol>
          <p className="text-sm text-muted-foreground">
            Las clases recuperadas deben usarse dentro del mismo mes natural. No se acumulan ni se
            trasladan al mes siguiente.
          </p>
        </section>

        {/* Detalle: bol de terracota */}
        <figure className="flex flex-col gap-3 pb-12">
          <img
            src={bolTerracotaAsset.url}
            alt="Bol de barro rojo con dos asas sobre una tela en la mesa de trabajo"
            loading="lazy"
            className="aspect-[4/3] w-full object-cover"
          />
          <figcaption className="text-sm text-muted-foreground">
            Cada pieza se modela a mano, a tu ritmo.
          </figcaption>
        </figure>

        {/* Closing CTA */}
        <section className="flex flex-col items-start gap-6 border-t border-border pb-12 pt-8">
          <h2 className="text-h2">¿List@ para empezar?</h2>
          <div className="flex flex-col gap-2">
            <p className="text-body max-w-xl">
              Consulta el calendario, descubre los días y horarios disponibles y elige la clase que
              mejor se adapte a ti.
            </p>
            <p className="text-body max-w-xl">Reserva tu lugar y empieza a crear.</p>
          </div>
          <Button asChild>
            <Link to="/solicitar">Ver clases y horarios</Link>
          </Button>
        </section>
      </main>
    </div>
  );
}

function InfoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-8 overflow-y-auto text-left sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-h2">Clases regulares de cerámica</DialogTitle>
          <DialogDescription>
            Son clases de modelado en cerámica, en grupos reducidos y para todos los niveles. No
            necesitas experiencia previa.
          </DialogDescription>
        </DialogHeader>

        <p className="text-body">
          En las clases exploramos diferentes técnicas e ideas para crear tus propias piezas.
          Trabajamos con arcilla gres, un material resistente y duradero, y puedes crear tanto
          piezas funcionales como piezas decorativas.
        </p>

        <dl className="grid gap-4 border-t border-border pt-6">
          <div className="flex flex-col gap-1">
            <dt className="text-label">Dónde</dt>
            <dd className="text-body">
              Taller Cazú Ceramics, Calle del Dr. Sumsi 9, Ruzafa, Valencia
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-label">Duración</dt>
            <dd className="text-body">2 horas por clase (las clases de niños son 1 hora)</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-label">Profesoras</dt>
            <dd className="text-body">
              Sofi (lunes y viernes) y Cande (martes, miércoles, jueves y viernes)
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-label">Frecuencia</dt>
            <dd className="text-body">
              Tú eliges cuántas veces quieres venir al mes, según el ritmo que quieras llevar.
            </dd>
          </div>
        </dl>

        <p className="text-body">
          Todas las herramientas, materiales y cocciones en el horno de cerámica están incluidos. La
          clase de niños (lunes 17:00, 1 h) tiene un precio aparte de{" "}
          <span className="whitespace-nowrap">12 €</span>.
        </p>

        <div className="flex flex-col gap-10">
          <h3 className="text-h3">¿Qué te gustaría hacer?</h3>

          <div className="flex flex-col gap-3 border-t border-border pt-6">
            <span className="text-label">Quiero probar una clase</span>
            <p className="text-body">
              Ven a conocer el estudio, experimentar con el barro y descubrir si la cerámica es para
              ti.
            </p>
            <TrialBooking />
          </div>

          <div className="flex flex-col items-start gap-3 border-t border-border pt-6">
            <span className="text-label">Quiero empezar con clases regulares</span>
            <p className="text-body">
              Elige el plan que mejor se adapte a tu ritmo y reserva tus clases según tu
              disponibilidad.
            </p>
            <Button asChild className="w-full">
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
  const [monthRef, setMonthRef] = useState<Date>(() => startOfMonth(DEFAULT_CALENDAR_MONTH));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loadingPay, setLoadingPay] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, date, start_time, end_time, audience, teacher")
        .eq("status", "scheduled")
        .gte("date", toIsoDate(DEFAULT_CALENDAR_MONTH))
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(500);
      if (error) {
        toast.error("No se pudieron cargar las clases", { description: error.message });
        setClasses([]);
        return;
      }
      setClasses(
        withoutClosedDates((data ?? []) as UpcomingClass[]).filter((c) => c.audience === "adults"),
      );
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

  const selectedIds = useMemo(() => new Set(selectedId ? [selectedId] : []), [selectedId]);

  const openBlankCheckoutTab = () => {
    try {
      const tab = window.open("", "_blank");
      if (!tab) return null;
      tab.document.write(
        '<!doctype html><html lang="es"><head><title>Abriendo pago…</title></head><body><p>Abriendo el pago seguro…</p></body></html>',
      );
      tab.document.close();
      return tab;
    } catch {
      return null;
    }
  };

  const handlePay = async () => {
    if (!selectedId) {
      toast.error("Elige un día y un horario para tu clase de prueba");
      return;
    }
    if (!name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      toast.error("Completa tu nombre y un correo válido");
      return;
    }
    setCheckoutUrl(null);
    const checkoutWindow = openBlankCheckoutTab();
    setLoadingPay(true);
    try {
      const { url } = await createTrialCheckout({
        classId: selectedId,
        email: email.trim(),
        name: name.trim(),
        returnUrl: `${window.location.origin}/`,
      });
      setCheckoutUrl(url);
      let opened = false;
      if (checkoutWindow) {
        try {
          checkoutWindow.document.open();
          checkoutWindow.document.write(
            `<!doctype html><html lang="es"><head><title>Abriendo pago…</title></head><body><p>Abriendo el pago seguro…</p><script>window.opener=null;window.location.replace(${JSON.stringify(url)});</script></body></html>`,
          );
          checkoutWindow.document.close();
          opened = true;
        } catch {
          checkoutWindow.close();
        }
      }
      if (!opened) {
        const directWindow = window.open(url, "_blank", "noopener,noreferrer");
        opened = Boolean(directWindow);
      }
      if (!opened) {
        toast.message("Pago listo", {
          description: "Pulsa el botón “Abrir pago en Stripe” para continuar.",
        });
      }
    } catch (err) {
      checkoutWindow?.close();
      toast.error("No se pudo iniciar el pago", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoadingPay(false);
    }
  };

  return (
    <div className="flex flex-col mt-3 gap-3">
      <p className="text-xs text-muted-foreground">
        Elige el día y la hora que te vengan bien (35 € · 2 h).
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="trial-name">Nombre</Label>
          <Input id="trial-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
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
        {loadingPay ? "Abriendo el pago…" : "Reservar y pagar 35 €"}
      </Button>
      {checkoutUrl ? (
        <Button asChild variant="secondary" className="w-full">
          <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
            Abrir pago en Stripe
          </a>
        </Button>
      ) : null}
      <p className="text-center text-xs text-muted-foreground">
        Pago seguro con Stripe. Recibirás la confirmación por correo.
      </p>
    </div>
  );
}
