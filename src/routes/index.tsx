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
    n: "1",
    title: "Solicitas tu plaza",
    body: "Rellena el formulario y elige las clases que te interesan. Sin compromiso.",
  },
  {
    n: "2",
    title: "Revisaremos tu solicitud",
    body: "Confirma la disponibilidad y aprueba las clases que mejor encajan contigo.",
  },
  {
    n: "3",
    title: "Recibiremos tu invitación",
    body: "Te llega un enlace por correo para crear tu cuenta en el estudio.",
  },
  {
    n: "4",
    title: "Reservas y modelas",
    body: "Entras al calendario, gestionas tus reservas y disfrutas del barro.",
  },
];

const PLANS = [
  { name: "1 clase", detail: "al mes", note: "Para empezar a tu ritmo" },
  { name: "2 clases", detail: "al mes", note: "El plan más elegido", featured: true },
  { name: "3 clases", detail: "al mes", note: "Para coger soltura" },
  { name: "4 clases", detail: "al mes", note: "Cerámica cada semana" },
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
            Crea, modela y disfruta del barro a tu ritmo.
          </h1>
          <p className="text-body mt-5 text-muted-foreground">
            En Cazú Ceramics trabajamos con grupos reducidos, atención personalizada y con la calma que pide la cerámica. Solicita tu plaza y te escribimos para empezar.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/solicitar">Solicitar plaza</Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
              <Link to="/login">Iniciar sesión</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            El acceso es por invitación. Solicita tu plaza y te confirmaremos.
          </p>
        </section>

        {/* Cómo funciona */}
        <section className="mt-20 sm:mt-28">
          <div className="text-center">
            <span className="text-label uppercase">¿Cómo funciona?</span>
            <h2 className="text-h2 mt-2">De la solicitud a tu primera clase</h2>
          </div>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        {/* Planes / precios teaser */}
        <section className="mt-20 sm:mt-28">
          <div className="text-center">
            <span className="text-label uppercase">Planes mensuales</span>
            <h2 className="text-h2 mt-2">Elige el ritmo que te encaja</h2>
            <p className="text-body mx-auto mt-3 max-w-xl text-muted-foreground">
              Tras tu admisión podrás contratar un plan mensual. Los créditos se
              reinician cada mes; reservas las clases que quieras desde el calendario.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={[
                  "rounded-2xl border bg-surface p-5 shadow-card",
                  p.featured ? "border-primary ring-1 ring-primary/30" : "border-border",
                ].join(" ")}
              >
                {p.featured ? (
                  <span className="text-label uppercase text-primary">Más popular</span>
                ) : (
                  <span className="text-label uppercase text-muted-foreground">Plan</span>
                )}
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-h3">{p.name}</span>
                  <span className="text-sm text-muted-foreground">{p.detail}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{p.note}</p>
              </div>
            ))}
          </div>
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
