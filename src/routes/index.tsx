import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const SHOP_URL = "https://cazuceramics.com";

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
    title: "¿Es tu primera vez?",
    body: "Consulta las clases, horarios y precios y solicita tu plaza para empezar.",
  },
  {
    n: "02",
    title: "¿Ya eres alumno/a?",
    body: "Accede a tu cuenta para consultar tus clases, reservar tus horarios y gestionar tus reservas.",
  },
  {
    n: "03",
    title: "Ven al estudio y crea",
    body: "Trabaja con el barro a tu ritmo, aprende nuevas técnicas y disfruta del proceso.",
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
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary" aria-hidden />
          <span className="text-h3">Cazú Ceramics</span>
        </div>
        <nav className="flex items-center gap-5">
          <a
            href={SHOP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            Tienda
          </a>
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
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/solicitar">Quiero empezar</Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
              <Link to="/login">Ya soy alumn@</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            El acceso es por invitación. Solicita tu plaza y te confirmaremos.
          </p>
        </section>

        {/* Cómo funciona */}
        <section className="mt-20 sm:mt-28">
          <div className="text-center">
            <span className="text-label uppercase">¿CÓMO FUNCIONA?</span>
            <h2 className="text-h2 mt-2">Empieza por aquí</h2>
          </div>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <span className="text-label uppercase">Planes mensuales</span>
            <h2 className="text-h2 mt-2">Elige cuánto quieres crear</h2>
            <p className="text-body mx-auto mt-3 max-w-xl text-muted-foreground">
              Encuentra el plan que mejor se adapte a tu ritmo. Tus clases se renuevan
              cada mes y puedes reservar tus horarios desde el calendario.
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
                ) : (
                  <span className="text-label uppercase text-muted-foreground">Plan</span>
                )}
                <div className="mt-2 flex items-baseline gap-1.5">
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

          <p className="mt-5 text-center text-sm text-muted-foreground">
            En caso de querer venir más de 4 clases al mes, el precio de cada clase
            extra es de 20 €.
          </p>

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
                Cancela tu clase con al menos 24 horas de antelación (el día anterior)
                para no perderla. Así podemos ofrecer tu plaza a alguien más.
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
              <h3 className="mt-4 text-base font-semibold">Si no avisas</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Si cancelas con menos de 24 horas o no asistes sin avisar, esa clase se
                cuenta como utilizada y no se puede recuperar.
              </p>
            </li>
          </ol>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Las clases recuperadas deben usarse dentro del mismo mes natural. No se
            acumulan ni se trasladan al mes siguiente.
          </p>
        </section>

        {/* Tienda / shop */}
        <section className="mt-20 sm:mt-28">
          <div className="rounded-2xl border border-border bg-surface p-7 shadow-card sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div>
              <span className="text-label uppercase">Tienda</span>
              <h2 className="text-h3 mt-1">¿Buscas piezas hechas a mano?</h2>
              <p className="text-body mt-2 max-w-xl text-muted-foreground">
                Descubre nuestra cerámica artesanal y la selección de materiales en la
                tienda online.
              </p>
            </div>
            <Button asChild size="lg" variant="secondary" className="mt-5 w-full sm:mt-0 sm:w-auto">
              <a href={SHOP_URL} target="_blank" rel="noopener noreferrer">
                Visitar la tienda
              </a>
            </Button>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mt-20 text-center sm:mt-28">
          <h2 className="text-h2">¿List@ para empezar?</h2>
          <p className="text-body mx-auto mt-3 max-w-md text-muted-foreground">
            Solicita tu plaza hoy y te avisamos en cuanto haya hueco para ti.
          </p>
          <div className="mt-6">
            <Button asChild size="lg">
              <Link to="/solicitar">Solicitar plaza</Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
