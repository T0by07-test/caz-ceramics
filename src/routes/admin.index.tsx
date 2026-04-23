import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <span className="text-label uppercase">Panel</span>
        <h1 className="text-h1 mt-1">Dashboard</h1>
        <p className="text-body mt-2 text-muted-foreground">
          Resumen del estudio: reservas, capacidad y pagos.
        </p>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-h3">Bienvenida</CardTitle>
          <CardDescription>
            Aquí aparecerá el resumen de actividad del estudio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-body text-muted-foreground">
            Pronto verás métricas de reservas, asistencia y pagos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
