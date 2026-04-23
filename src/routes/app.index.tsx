import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/app/")({
  component: CalendarioPage,
});

function CalendarioPage() {
  return (
    <div className="space-y-6">
      <div>
        <span className="text-label uppercase">Tu mes</span>
        <h1 className="text-h1 mt-1">Calendario</h1>
        <p className="text-body mt-2 text-muted-foreground">
          Aquí verás las clases disponibles este mes y podrás reservar tu plaza.
        </p>
      </div>

      {/* Demo: Card + primary + secondary buttons */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-h3">Próxima clase</CardTitle>
          <CardDescription>Martes 28 de mayo · 18:30 — 20:30</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button className="w-full sm:w-auto">Reservar plaza</Button>
          <Button variant="secondary" className="w-full sm:w-auto">
            Ver detalles
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
