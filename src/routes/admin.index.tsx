import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  RotateCcw,
  Users,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { supabase } from "@/integrations/supabase/client";
import {
  ES_WEEKDAYS_SHORT,
  capacityDotClass,
  capacityLevel,
  formatLongDate,
  formatTimeRange,
  toIsoDate,
} from "@/lib/calendar";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Dashboard — Admin" }] }),
  component: AdminDashboardPage,
});

type WeekClass = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity_max: number;
  booked: number;
};

type RiskClass = WeekClass;

type RecentPayment = {
  id: string;
  amount_cents: number;
  created_at: string;
  student_name: string;
  kind: "Plan" | "Clase suelta";
};

type Kpis = {
  total: number;
  confirmed: number;
  cancelled: number;
  attended: number;
  active_students: number;
  revenue_cents: number;
  pending_makeups: number;
  per_plan: { name: string; count: number }[];
};

function startOfMonthIso(d: Date) {
  return toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}
function endOfMonthIso(d: Date) {
  return toIsoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
function startOfWeekIso(d: Date) {
  const offset = (d.getDay() + 6) % 7;
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
  return toIsoDate(m);
}
function endOfWeekIso(d: Date) {
  const offset = (d.getDay() + 6) % 7;
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset + 6);
  return toIsoDate(m);
}
function formatEur(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
}

function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [weekClasses, setWeekClasses] = useState<WeekClass[]>([]);
  const [risk, setRisk] = useState<RiskClass[]>([]);
  const [payments, setPayments] = useState<RecentPayment[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const now = new Date();
      const monthStart = startOfMonthIso(now);
      const monthEnd = endOfMonthIso(now);
      const weekStart = startOfWeekIso(now);
      const weekEnd = endOfWeekIso(now);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Classes in the current month for KPI booking joins
      const { data: monthClasses } = await supabase
        .from("classes")
        .select("id, date, start_time, end_time, capacity_max, status")
        .gte("date", monthStart)
        .lte("date", monthEnd);

      const monthClassIds = (monthClasses ?? []).map((c) => c.id);

      // Bookings for the month
      const { data: monthBookings } = monthClassIds.length
        ? await supabase
            .from("bookings")
            .select("id, status, class_id, student_id")
            .in("class_id", monthClassIds)
        : { data: [] as { id: string; status: string; class_id: string; student_id: string }[] };

      const total = (monthBookings ?? []).length;
      const confirmed = (monthBookings ?? []).filter((b) =>
        ["reserved", "confirmed", "attended"].includes(b.status),
      ).length;
      const cancelled = (monthBookings ?? []).filter((b) =>
        ["cancelled_recoverable", "cancelled_lost"].includes(b.status),
      ).length;
      const attended = (monthBookings ?? []).filter((b) => b.status === "attended").length;

      // Subscriptions this month → active students per plan
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("student_id, plan_id")
        .eq("month", monthStart);
      const planIds = Array.from(new Set((subs ?? []).map((s) => s.plan_id)));
      const { data: plansData } = planIds.length
        ? await supabase.from("plans").select("id, name").in("id", planIds)
        : { data: [] as { id: string; name: string }[] };
      const planNameById = new Map((plansData ?? []).map((p) => [p.id, p.name]));
      const perPlanCounts = new Map<string, number>();
      for (const s of subs ?? []) {
        const name = planNameById.get(s.plan_id) ?? "—";
        perPlanCounts.set(name, (perPlanCounts.get(name) ?? 0) + 1);
      }
      const per_plan = Array.from(perPlanCounts, ([name, count]) => ({ name, count })).sort(
        (a, b) => b.count - a.count,
      );
      const active_students = new Set((subs ?? []).map((s) => s.student_id)).size;

      // Confirmed payments in month
      const { data: paidThisMonth } = await supabase
        .from("payments")
        .select("amount_cents, created_at")
        .eq("status", "confirmed")
        .gte("created_at", `${monthStart}T00:00:00`)
        .lte("created_at", `${monthEnd}T23:59:59`);
      const revenue_cents = (paidThisMonth ?? []).reduce((s, p) => s + p.amount_cents, 0);

      // Pending makeups (active across all students)
      const { count: pendingMakeups } = await supabase
        .from("makeups")
        .select("id", { count: "exact", head: true })
        .is("used_booking_id", null)
        .gt("expires_at", new Date().toISOString());

      // Week classes
      const { data: weekRaw } = await supabase
        .from("classes")
        .select("id, date, start_time, end_time, capacity_max")
        .eq("status", "scheduled")
        .gte("date", weekStart)
        .lte("date", weekEnd)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });

      const weekIds = (weekRaw ?? []).map((c) => c.id);
      const counts = new Map<string, number>();
      if (weekIds.length) {
        const { data: bs } = await supabase
          .from("bookings")
          .select("class_id")
          .in("class_id", weekIds)
          .in("status", ["reserved", "confirmed", "attended"]);
        for (const b of bs ?? []) counts.set(b.class_id, (counts.get(b.class_id) ?? 0) + 1);
      }
      const week: WeekClass[] = (weekRaw ?? []).map((c) => ({
        ...c,
        booked: counts.get(c.id) ?? 0,
      }));

      // Risk classes (next 24h, <3 students)
      const riskList: RiskClass[] = [];
      for (const c of week) {
        const startMs = new Date(`${c.date}T${c.start_time}`).getTime();
        if (startMs < now.getTime() || startMs > tomorrow.getTime()) continue;
        if (c.booked < 3) riskList.push(c);
      }

      // Last 10 confirmed payments
      const { data: lastPayments } = await supabase
        .from("payments")
        .select("id, amount_cents, created_at, student_id, booking_id, subscription_id")
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(10);
      const studentIds = Array.from(new Set((lastPayments ?? []).map((p) => p.student_id)));
      const { data: studentProfiles } = studentIds.length
        ? await supabase
            .from("profiles")
            .select("id, name, surname, email")
            .in("id", studentIds)
        : { data: [] as { id: string; name: string | null; surname: string | null; email: string | null }[] };
      const profileById = new Map((studentProfiles ?? []).map((p) => [p.id, p]));
      const recent: RecentPayment[] = (lastPayments ?? []).map((p) => {
        const prof = profileById.get(p.student_id);
        const fullName =
          [prof?.name, prof?.surname].filter(Boolean).join(" ").trim() || prof?.email || "—";
        return {
          id: p.id,
          amount_cents: p.amount_cents,
          created_at: p.created_at,
          student_name: fullName,
          kind: p.subscription_id ? "Plan" : "Clase suelta",
        };
      });

      if (cancelled) return;
      setKpis({
        total,
        confirmed,
        cancelled,
        attended,
        active_students,
        revenue_cents,
        pending_makeups: pendingMakeups ?? 0,
        per_plan,
      });
      setWeekClasses(week);
      setRisk(riskList);
      setPayments(recent);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const monthLabel = useMemo(() => {
    const months = [
      "enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre",
    ];
    const d = new Date();
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <span className="text-label uppercase">Panel</span>
        <h1 className="text-h1 mt-1">Dashboard</h1>
        <p className="text-body mt-2 text-muted-foreground capitalize">
          Resumen del estudio · {monthLabel}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <KpiCard
          label="Reservas totales"
          value={loading ? null : kpis?.total ?? 0}
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <KpiCard
          label="Confirmadas"
          value={loading ? null : kpis?.confirmed ?? 0}
          icon={<CheckCircle2 className="h-4 w-4 text-success" />}
        />
        <KpiCard
          label="Canceladas"
          value={loading ? null : kpis?.cancelled ?? 0}
          icon={<XCircle className="h-4 w-4 text-destructive" />}
        />
        <KpiCard
          label="Asistencias"
          value={loading ? null : kpis?.attended ?? 0}
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          label="Alumnas activas"
          value={loading ? null : kpis?.active_students ?? 0}
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          label="Ingresos del mes"
          value={loading ? null : formatEur(kpis?.revenue_cents ?? 0)}
          icon={<CreditCard className="h-4 w-4" />}
        />
        <KpiCard
          label="Recuperaciones pendientes"
          value={loading ? null : kpis?.pending_makeups ?? 0}
          icon={<RotateCcw className="h-4 w-4" />}
        />
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardDescription className="text-label uppercase">Alumnas por plan</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <Skeleton className="h-12 w-full" />
            ) : kpis && kpis.per_plan.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {kpis.per_plan.slice(0, 4).map((p) => (
                  <li key={p.name} className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted-foreground">{p.name}</span>
                    <Badge variant="secondary">{p.count}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sin suscripciones este mes.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Risk classes */}
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
            <Skeleton className="h-16 w-full" />
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
                      {c.booked}/3
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

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Week classes */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-h3">Clases de esta semana</CardTitle>
            <CardDescription>Capacidad de cada clase programada.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : weekClasses.length === 0 ? (
              <EmptyState
                title="Sin clases esta semana"
                description="Crea nuevas clases desde el calendario."
              />
            ) : (
              <ul className="space-y-3">
                {weekClasses.map((c) => {
                  const level = capacityLevel(c.booked, c.capacity_max);
                  const pct = Math.min(100, (c.booked / c.capacity_max) * 100);
                  const dayIdx = (new Date(`${c.date}T00:00:00`).getDay() + 6) % 7;
                  return (
                    <li key={c.id}>
                      <Link
                        to="/admin/clases"
                        className="block rounded-lg border border-border bg-surface px-3 py-2 transition-colors hover:bg-accent"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium">
                              {ES_WEEKDAYS_SHORT[dayIdx]} ·{" "}
                              <span className="text-muted-foreground">
                                {formatTimeRange(c.start_time, c.end_time)}
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 w-full rounded-full bg-secondary">
                              <div
                                className={`h-full rounded-full ${capacityDotClass(level)}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <Badge variant="outline" className="shrink-0">
                            {c.booked}/{c.capacity_max}
                          </Badge>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent payments */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-h3">Últimos pagos</CardTitle>
            <CardDescription>Las 10 últimas confirmaciones.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : payments.length === 0 ? (
              <EmptyState title="Aún no hay pagos confirmados" />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.student_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.kind} · {new Date(p.created_at).toLocaleDateString("es-ES")}
                      </div>
                    </div>
                    <span className="font-semibold">{formatEur(p.amount_cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string | null;
  icon: React.ReactNode;
}) {
  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardDescription className="text-label flex items-center gap-2 uppercase">
          {icon}
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {value === null ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <p className="text-2xl font-bold tracking-tight">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}