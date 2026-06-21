import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Registro por invitación — Cazu Ceramics" },
      {
        name: "description",
        content: "El acceso a Cazu Ceramics es por invitación. Solicita tu plaza.",
      },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { session, role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (session && role) {
      navigate({ to: role === "admin" ? "/admin" : "/app" });
    }
  }, [session, role, loading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <Card className="w-full max-w-md text-center shadow-card">
        <CardHeader>
          <CardTitle className="text-h2">El registro es solo por invitación</CardTitle>
          <CardDescription>
            En Cazu Ceramics las plazas son limitadas. Solicita la tuya y Cande te
            escribirá con un enlace para crear tu cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild className="w-full" size="lg">
            <Link to="/solicitar">Solicitar plaza</Link>
          </Button>
          <Button asChild variant="secondary" className="w-full" size="lg">
            <Link to="/login">Ya tengo cuenta</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
