import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatLongDate, formatTimeRange } from "@/lib/calendar";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboardPage,
});

type RiskClass = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  booked_count: number;
};

function AdminDashboardPage() {
  const [risk, setRisk] = useState<RiskClass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const todayIso = now.toISOString().slice(0, 10);
      const tomorrowIso = tomorrow.toISOString().slice(0, 10);

      const { data: classes, error } = await supabase
        .from("classes")
        .select("id, date, start_time, end_time")
        .eq("status", "scheduled")
        .gte("date", todayIso)
        .lte("date", tomorrowIso)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });
      if (cancelled || error || !classes) {
        if (!cancelled) {
          setRisk([]);
          setLoading(false);
        }
        return;
      }

      const ids = classes.map((c) => c.id);
      const counts = new Map<string, number>();
      if (ids.length > 0) {
        const { data: bookings } = await supabase
          .from("bookings")
          .select("class_id")
          .in("class_id", ids)
          .in("status", ["reserved", "confirmed", "attended"]);
        for (const b of bookings ?? []) {
          counts.set(b.class_id, (counts.get(b.class_id) ?? 0) + 1);
        }
      }

      const filtered: RiskClass[] = [];
      for (const c of classes) {
        const startMs = new Date(`${c.date}T${c.start_time}`).getTime();
        if (startMs < now.getTime() || startMs > tomorrow.getTime()) continue;
        const count = counts.get(c.id) ?? 0;
        if (count < 3) {
          filtered.push({ ...c, booked_count: count });
        }
      }
      if (!cancelled) {
        setRisk(filtered);
        setLoading(false);
      }
    };
    void load();

    const ch = supabase
      .channel("admin-risk-classes")
      .on("postgres_changes", { event: "*", schema: "public", table: "classes" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => void load())
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <span className="text-label uppercase">Panel</span>
        <h1 className="text-h1 mt-1">Dashboard</h1>
        <p className="text-body mt-2 text-muted-foreground">
          Resumen del estudio: reservas, capacidad y pagos.
        </p>
      </div>

      <Card className="border-warning/40 shadow-card">
        <CardHeader>
          <CardTitle className="text-h3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Clases en riesgo
          </CardTitle>
          <CardDescription>
            Clases en las próximas 24h con menos de 3 alumnas inscritas. Se cancelarán
            automáticamente si no alcanzan el mínimo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : risk.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todas las clases próximas tienen suficientes alumnas.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {risk.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium capitalize">
                      {formatLongDate(c.date)}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatTimeRange(c.start_time, c.end_time)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-warning/50 text-warning-foreground">
                      {c.booked_count}/3
                    </Badge>
                    <Link
                      to="/admin/clases"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Ver
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
