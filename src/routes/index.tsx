import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cerámica Studio — Clases de cerámica en un espacio acogedor" },
      {
        name: "description",
        content:
          "Reserva tus clases de cerámica en Cerámica Studio. Planes mensuales y clases sueltas en un ambiente cálido y artesanal.",
      },
      { property: "og:title", content: "Cerámica Studio" },
      {
        property: "og:description",
        content: "Reserva tus clases de cerámica. Planes mensuales y clases sueltas.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary" aria-hidden />
          <span className="text-h3">Cerámica Studio</span>
        </div>
        <Link
          to="/login"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Iniciar sesión
        </Link>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pb-20 pt-10 sm:px-8 sm:pt-16 lg:pt-24">
        <section className="mx-auto max-w-2xl text-center">
          <span className="text-label uppercase">Estudio de cerámica</span>
          <h1 className="text-h1 mt-3 text-foreground">
            Modela, crea y disfruta del barro a tu ritmo
          </h1>
          <p className="text-body mt-5 text-muted-foreground">
            Reserva tus clases mensuales o sueltas en un espacio cálido y artesanal.
            Plazas reducidas, atención personalizada y la flexibilidad que necesitas.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/signup">Crear cuenta</Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
              <Link to="/login">Iniciar sesión</Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
