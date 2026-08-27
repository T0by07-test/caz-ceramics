import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth, isStaff } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Crear cuenta — Cazu Ceramics" },
      {
        name: "description",
        content: "Crea tu cuenta de Cazu Ceramics con tu correo y contraseña para reservar clases.",
      },
      { property: "og:title", content: "Crear cuenta — Cazu Ceramics" },
      {
        property: "og:description",
        content: "Crea tu cuenta y reserva tus clases de cerámica.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { session, role, loading } = useAuth();
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (session && role) {
      navigate({ to: isStaff(role) ? "/admin" : "/app" });
    }
  }, [session, role, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: { name, surname },
      },
    });
    setSubmitting(false);
    if (error) {
      const msg = /weak|pwned/i.test(error.message)
        ? "Esa contraseña es demasiado común. Prueba con otra más difícil de adivinar."
        : /already registered|already exists/i.test(error.message)
          ? "Ese correo ya tiene cuenta. Inicia sesión."
          : error.message;
      toast.error("No se pudo crear la cuenta", { description: msg });
      return;
    }
    if (data.session) {
      toast.success("¡Cuenta creada!", {
        description: "Ya puedes reservar tus clases.",
      });
      // Routing happens via the effect once the role is loaded.
      return;
    }
    toast.success("Revisa tu correo", {
      description: "Te enviamos un enlace para confirmar tu cuenta.",
    });
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1180px] items-center justify-center px-4 py-24 sm:px-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-h2">Crear cuenta</CardTitle>
          <CardDescription>
            Regístrate con tu correo y contraseña para ver el calendario y reservar tus clases.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="surname">Apellido</Label>
                <Input id="surname" value={surname} onChange={(e) => setSurname(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@correo.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Creando cuenta…" : "Crear cuenta y reservar"}
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
  );
}
