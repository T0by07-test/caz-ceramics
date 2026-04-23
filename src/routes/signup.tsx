import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Crear cuenta — Cerámica Studio" },
      { name: "description", content: "Crea tu cuenta y elige tu plan en Cerámica Studio." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader>
          <CardTitle className="text-h2">Crear cuenta</CardTitle>
          <CardDescription>Empieza a reservar tus clases de cerámica.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ to: "/app" });
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="surname">Apellido</Label>
                <Input id="surname" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input id="email" type="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input id="whatsapp" type="tel" placeholder="+34 600 000 000" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan">Plan</Label>
              <Select defaultValue="2">
                <SelectTrigger id="plan">
                  <SelectValue placeholder="Elige un plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 clase / mes</SelectItem>
                  <SelectItem value="2">2 clases / mes</SelectItem>
                  <SelectItem value="3">3 clases / mes</SelectItem>
                  <SelectItem value="4">4 clases / mes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" size="lg">
              Crear cuenta
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
