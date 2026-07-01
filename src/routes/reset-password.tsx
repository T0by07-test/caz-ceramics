import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nueva contraseña — Cerámica Studio" },
      { name: "description", content: "Elige una nueva contraseña para tu cuenta." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery hash automatically and fires PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error("No se pudo actualizar", { description: error.message });
      return;
    }
    toast.success("Contraseña actualizada");
    navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader>
          <CardTitle className="text-h2">Nueva contraseña</CardTitle>
          <CardDescription>
            {ready
              ? "Elige una contraseña segura para tu cuenta."
              : "Verificando el enlace de recuperación…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="password">Nueva contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!ready}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Repite la contraseña</Label>
              <Input
                id="confirm"
                type="password"
                placeholder="••••••••"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={!ready}
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={!ready || submitting}>
              {submitting ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}