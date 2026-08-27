import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1180px] items-center justify-center px-8 py-24">
      <div className="flex max-w-md flex-col items-center gap-6 border-t border-border pt-12 text-center">
        <h1 className="text-h1">Página no encontrada</h1>
        <p className="text-body">La página que buscas no existe o se ha movido.</p>
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-4 font-display text-[13px] uppercase leading-none tracking-[0.16em] text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Cerámica Studio — Reservas" },
      { name: "description", content: "Reserva tus clases de cerámica en nuestro estudio." },
      { name: "author", content: "Cerámica Studio" },
      { property: "og:title", content: "Cerámica Studio — Reservas" },
      { property: "og:description", content: "Reserva tus clases de cerámica en nuestro estudio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Cerámica Studio — Reservas" },
      {
        name: "twitter:description",
        content: "Reserva tus clases de cerámica en nuestro estudio.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/970013cf-9176-4ac1-8d72-e2153af0f629/id-preview-1c19401e--995d85d1-d1cf-4d33-a106-2a11d90dc0f9.lovable.app-1782646880800.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/970013cf-9176-4ac1-8d72-e2153af0f629/id-preview-1c19401e--995d85d1-d1cf-4d33-a106-2a11d90dc0f9.lovable.app-1782646880800.png",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Jost:wght@200;300;400;500&family=Roboto:wght@300;400&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}
