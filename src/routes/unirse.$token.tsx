import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { redeemInvite, enrollFromInvite, type RedeemInviteResult } from "@/lib/requests";
import { formatLongDate, formatTimeRange } from "@/lib/calendar";

export const Route = createFileRoute("/unirse/$token")({
  head: () => ({
    meta: [
      { title: "Aceptar invitación — Cazu Ceramics" },
      { name: "description", content: "Crea tu cuenta y entra en tus clases de cerámica." },
    ],
  }),
  component: UnirsePage,
});

function UnirsePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<RedeemInviteResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await redeemInvite(token);
        if (cancelled) return;
        setInvite(data);
        setName(data.name ?? "");
        setSurname(data.surname ?? "");
        setWhatsapp(data.whatsapp ?? "");
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "No se pudo leer la invitación.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite?.email) {
      toast.error("Invitación no válida");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/app`,
          data: {
            name: name.trim(),
            surname: surname.trim(),
            whatsapp: whatsapp.trim(),
            invite_token: token,
          },
        },
      });
      if (error) throw new Error(error.message);

      // If email confirmation is required there may be no session yet.
      if (!data.session) {
        toast.success("Cuenta creada", {
          description:
            "Revisa tu correo para confirmar. Después podrás entrar y verás tus clases.",
        });
        setSubmitting(false);
        return;
      }

      // Session is live → book the granted classes as comp.
      await enrollFromInvite(token);
      toast.success("¡Listo! Ya estás dentro", {
        description: "Hemos reservado tus clases. Bienvenida a Cazu Ceramics.",
      });
      navigate({ to: "/app" });
    } catch (err) {
      toast.error("No se pudo completar el registro", {
        description: err instanceof Error ? err.message : undefined,
      });
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <CenteredCard>
        <CardHeader>
          <CardTitle className="text-h2">Cargando invitación…</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-lg border border-border bg-surface"
              />
            ))}
          </div>
        </CardContent>
      </CenteredCard>
    );
  }

  const invalid =
    loadError !== null ||
    invite === null ||
    invite.status !== "pending" ||
    !invite.email;

  if (invalid) {
    const description =
      invite?.status === "accepted"
        ? "Esta invitación ya se utilizó. Inicia sesión con tu cuenta."
        : invite?.status === "expired"
          ? "Esta invitación ha caducado. Pide una nueva a Cande."
          : invite?.status === "revoked"
            ? "Esta invitación ya no es válida."
            : "No pudimos encontrar esta invitación o ya no es válida.";
    return (
      <CenteredCard>
        <CardHeader>
          <CardTitle className="text-h2">Invitación no válida</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild className="w-full" size="lg">
            <Link to="/login">Iniciar sesión</Link>
          </Button>
          <Button asChild variant="secondary" className="w-full" size="lg">
            <Link to="/solicitar">Solicitar plaza</Link>
          </Button>
        </CardContent>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard>
      <CardHeader>
        <CardTitle className="text-h2">¡Bienvenida a Cazu Ceramics!</CardTitle>
        <CardDescription>
          Tu plaza está aprobada. Crea tu contraseña y entrarás directamente en tus clases.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {invite.classes.length > 0 ? (
          <div className="mb-5 rounded-lg border border-border bg-surface p-4">
            <div className="text-label uppercase">Tus clases</div>
            <ul className="mt-2 space-y-1.5">
              {invite.classes.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-medium capitalize">{formatLongDate(c.date)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatTimeRange(c.start_time, c.end_time)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input id="email" type="email" value={invite.email ?? ""} disabled />
          </div>
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
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting ? "Creando tu cuenta…" : "Crear cuenta y entrar"}
          </Button>
        </form>
      </CardContent>
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <Card className="w-full max-w-md shadow-card">{children}</Card>
    </div>
  );
}
