import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Wallet, TrendingUp, CalendarClock, PiggyBank } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useFinanceData } from "@/lib/finance/useFinanceData";
import { formatEur } from "@/lib/finance/format";
import type { MonthlyFinance } from "@/lib/finance/types";

export const Route = createFileRoute("/admin/finanzas")({
  head: () => ({ meta: [{ title: "Finanzas — Admin" }] }),
  component: AdminFinanzasPage,
});

const COLOR_FACTURADO = "#d9b08c";
const COLOR_NETO = "#7a9e7e";
const METHOD_LABEL: Record<string, string> = {
  T: "Tarjeta",
  E: "Efectivo",
  B: "Bizum",
  R: "Revolut",
  "": "Sin registrar",
};
const METHOD_COLOR: Record<string, string> = {
  T: "#5b8db8",
  E: "#5a9e72",
  B: "#8b6ba8",
  R: "#e07848",
  "": "#c8bfb5",
};

const titleCase = (m: string) => m.charAt(0) + m.slice(1).toLowerCase();
const short = (m: string) => m.slice(0, 3);

function AdminFinanzasPage() {
  const { loading, error, ledger, monthly, totals } = useFinanceData();

  const realMonths = useMemo(() => monthly.filter((m) => m.facturado > 0), [monthly]);
  const currentMonth: MonthlyFinance | undefined = realMonths[realMonths.length - 1];

  const chartData = useMemo(
    () =>
      realMonths.map((m) => ({
        mes: short(m.month),
        Facturado: Math.round(m.facturado / 100),
        Neto: Math.round(m.beneficio_neto / 100),
      })),
    [realMonths],
  );

  // Category breakdown for the latest real month (paid income)
  const cats = useMemo(() => {
    if (!currentMonth) return [] as { name: string; cents: number }[];
    const acc = new Map<string, number>();
    for (const r of ledger) {
      if (r.month !== currentMonth.month || r.status !== "Pagado") continue;
      const c = r.category || "Sin categoría";
      acc.set(c, (acc.get(c) ?? 0) + (r.amount_cents ?? 0));
    }
    return Array.from(acc, ([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);
  }, [ledger, currentMonth]);
  const catMax = cats.length ? cats[0].cents : 1;

  // Method distribution for the latest real month
  const methodData = useMemo(() => {
    if (!currentMonth) return [] as { key: string; label: string; cents: number }[];
    const acc = new Map<string, number>();
    for (const r of ledger) {
      if (r.month !== currentMonth.month || r.status !== "Pagado") continue;
      const k = r.method || "";
      acc.set(k, (acc.get(k) ?? 0) + (r.amount_cents ?? 0));
    }
    return Array.from(acc, ([key, cents]) => ({ key, label: METHOD_LABEL[key] ?? key, cents })).sort(
      (a, b) => b.cents - a.cents,
    );
  }, [ledger, currentMonth]);

  // Pending payments (all real months), most recent month first
  const pendientes = useMemo(
    () =>
      ledger
        .filter((r) => r.status === "Pendiente" && (r.amount_cents ?? 0) > 0)
        .sort((a, b) => (b.amount_cents ?? 0) - (a.amount_cents ?? 0)),
    [ledger],
  );

  // Commissions YTD per teacher + current month
  const commissions = useMemo(() => {
    const ytd = new Map<string, number>();
    for (const m of realMonths) {
      for (const [t, v] of Object.entries(m.comisiones_por_profesor)) {
        ytd.set(t, (ytd.get(t) ?? 0) + v);
      }
    }
    return Array.from(ytd, ([teacher, ytdCents]) => ({
      teacher,
      ytdCents,
      monthCents: currentMonth?.comisiones_por_profesor[teacher] ?? 0,
    })).sort((a, b) => b.ytdCents - a.ytdCents);
  }, [realMonths, currentMonth]);

  const media = totals.realMonths ? totals.beneficio_neto / totals.realMonths : 0;

  return (
    <div className="space-y-6">
      <div>
        <span className="text-label uppercase">Finanzas</span>
        <h1 className="text-h1 mt-1">Panel financiero</h1>
        <p className="text-body mt-2 text-muted-foreground">
          Ingresos, gastos y beneficio neto real. Impuestos orientativos — validar con el gestor.
        </p>
      </div>

      {error && (
        <Card className="border-destructive/40 shadow-card">
          <CardContent className="p-4 text-sm text-destructive">
            No se pudieron cargar los datos: {error}. ¿Se aplicó la migración del módulo de finanzas?
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Facturado YTD"
          value={loading ? null : formatEur(totals.facturado)}
          icon={<Wallet className="h-4 w-4" />}
        />
        <KpiCard
          label="Beneficio neto YTD"
          value={loading ? null : formatEur(totals.beneficio_neto)}
          icon={<TrendingUp className="h-4 w-4 text-success" />}
          accent="success"
        />
        <KpiCard
          label="Media neto / mes"
          value={loading ? null : formatEur(media)}
          icon={<PiggyBank className="h-4 w-4 text-success" />}
          accent="success"
        />
        <KpiCard
          label="Pendiente total"
          value={loading ? null : formatEur(totals.pendiente)}
          icon={<CalendarClock className="h-4 w-4 text-warning" />}
          accent="warning"
        />
      </div>

      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : realMonths.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="p-6">
            <EmptyState
              title="Aún no hay datos financieros"
              description="Aplica la migración y el import del módulo de finanzas para ver el panel."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Chart + pendientes */}
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-h3">Facturado vs. beneficio neto</CardTitle>
                <CardDescription>Por mes (solo meses con datos reales).</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
                      <XAxis dataKey="mes" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                        tickFormatter={(v) => `${v}€`}
                      />
                      <Tooltip formatter={(v: number) => `${v.toLocaleString("es-ES")} €`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Facturado" fill={COLOR_FACTURADO} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Neto" fill={COLOR_NETO} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-h3">Pendientes por cobrar</CardTitle>
                <CardDescription>
                  {pendientes.length} pendientes · {formatEur(totals.pendiente)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendientes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin pendientes 🎉</p>
                ) : (
                  <ul className="max-h-[230px] space-y-1 overflow-y-auto">
                    {pendientes.slice(0, 30).map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 border-b border-border py-1.5 text-sm last:border-0"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">{r.student_name ?? "—"}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {titleCase(r.month ?? "")} {r.item ? `· ${r.item}` : ""}
                          </div>
                        </div>
                        <Badge className="bg-warning text-warning-foreground shrink-0">
                          {formatEur(r.amount_cents ?? 0)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Category + method (latest real month) */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-h3">Ingresos por categoría</CardTitle>
                <CardDescription>{currentMonth ? titleCase(currentMonth.month) : ""}</CardDescription>
              </CardHeader>
              <CardContent>
                {cats.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin datos.</p>
                ) : (
                  <div className="space-y-2.5">
                    {cats.map((c) => (
                      <div key={c.name}>
                        <div className="flex items-center justify-between text-sm">
                          <span>{c.name}</span>
                          <span className="font-semibold">{formatEur(c.cents)}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.round((c.cents / catMax) * 100)}%`,
                              backgroundColor: COLOR_FACTURADO,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-h3">Método de pago</CardTitle>
                <CardDescription>{currentMonth ? titleCase(currentMonth.month) : ""}</CardDescription>
              </CardHeader>
              <CardContent>
                {methodData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin datos.</p>
                ) : (
                  <div className="grid grid-cols-[160px_1fr] items-center gap-4">
                    <div className="h-[160px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={methodData}
                            dataKey="cents"
                            nameKey="label"
                            innerRadius={42}
                            outerRadius={70}
                            paddingAngle={2}
                          >
                            {methodData.map((m) => (
                              <Cell key={m.key} fill={METHOD_COLOR[m.key] ?? "#c8bfb5"} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => formatEur(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      {methodData.map((m) => (
                        <li key={m.key} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: METHOD_COLOR[m.key] ?? "#c8bfb5" }}
                            />
                            {m.label}
                          </span>
                          <span className="font-semibold">{formatEur(m.cents)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Commissions */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-h3">Comisiones a profesoras</CardTitle>
              <CardDescription>
                Lo que Cande paga por las clases dadas por otras profesoras.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {commissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin comisiones registradas (etiqueta las clases con la profesora en Ingresos).
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {commissions.map((c) => (
                    <li key={c.teacher} className="flex items-center justify-between gap-3 py-2">
                      <span className="font-medium">{c.teacher}</span>
                      <span className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">
                          {currentMonth ? titleCase(currentMonth.month) : ""}:{" "}
                          <b className="text-foreground">{formatEur(c.monthCents)}</b>
                        </span>
                        <span>
                          YTD: <b>{formatEur(c.ytdCents)}</b>
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Monthly net table */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-h3">Detalle mensual (neto real)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-3">Mes</th>
                      <th className="px-3 py-2 text-right">Facturado</th>
                      <th className="px-3 py-2 text-right">Ef. exento</th>
                      <th className="px-3 py-2 text-right">Gastos</th>
                      <th className="px-3 py-2 text-right">IVA</th>
                      <th className="px-3 py-2 text-right">IRPF</th>
                      <th className="px-3 py-2 text-right">Comis.</th>
                      <th className="py-2 pl-3 text-right">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {realMonths.map((m) => (
                      <tr key={m.month} className="border-b border-border/60">
                        <td className="py-2 pr-3">{titleCase(m.month)}</td>
                        <td className="px-3 py-2 text-right">{formatEur(m.facturado)}</td>
                        <td className="px-3 py-2 text-right">{formatEur(m.efectivo_exento)}</td>
                        <td className="px-3 py-2 text-right">{formatEur(m.gastos)}</td>
                        <td className="px-3 py-2 text-right">{formatEur(m.iva_a_pagar)}</td>
                        <td className="px-3 py-2 text-right">{formatEur(m.irpf)}</td>
                        <td className="px-3 py-2 text-right">{formatEur(m.comisiones_profesores)}</td>
                        <td className="py-2 pl-3 text-right font-semibold text-success">
                          {formatEur(m.beneficio_neto)}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-2 pr-3">TOTAL</td>
                      <td className="px-3 py-2 text-right">{formatEur(totals.facturado)}</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">{formatEur(totals.gastos)}</td>
                      <td className="px-3 py-2 text-right">{formatEur(totals.iva_a_pagar)}</td>
                      <td className="px-3 py-2 text-right">{formatEur(totals.irpf)}</td>
                      <td className="px-3 py-2 text-right">
                        {formatEur(totals.comisiones_profesores)}
                      </td>
                      <td className="py-2 pl-3 text-right text-success">
                        {formatEur(totals.beneficio_neto)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | null;
  icon: React.ReactNode;
  accent?: "success" | "warning";
}) {
  const valueClass =
    accent === "success" ? "text-success" : accent === "warning" ? "text-warning" : "";
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
          <Skeleton className="h-7 w-24" />
        ) : (
          <p className={`text-2xl font-bold tracking-tight ${valueClass}`}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
