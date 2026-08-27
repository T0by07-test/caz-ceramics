import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isStaff } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión — Cerámica Studio" },
      { name: "description", content: "Accede a tu cuenta de Cerámica Studio." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, role, loading } = useAuth();
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
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error("No se pudo iniciar sesión", { description: error.message });
      return;
    }
    // Routing happens via the effect once role is loaded.
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1180px] items-center justify-center px-4 py-24 sm:px-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-h2">Iniciar sesión</CardTitle>
          <CardDescription>Accede a tu cuenta para reservar clases.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
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
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Entrando…" : "Entrar"}
            </Button>
            <p className="text-center text-sm">
              <Link to="/forgot-password" className="font-medium text-primary hover:underline">
                ¿Olvidaste tu contraseña?
              </Link>
            </p>
            <p className="text-center text-sm text-muted-foreground">
              ¿Aún no tienes cuenta?{" "}
              <Link to="/signup" className="font-medium text-primary hover:underline">
                Crear cuenta
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
