import { useEffect, useMemo, useState } from "react";
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
import {
  Wallet,
  TrendingUp,
  CalendarClock,
  PiggyBank,
  SlidersHorizontal,
  FileDown,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { useFinanceData } from "@/lib/finance/useFinanceData";
import { tbl, type CommissionRateRow } from "@/lib/finance/db";
import { formatEur, inputToPct, pctToInput } from "@/lib/finance/format";
import type { FinanceSettings, MonthlyFinance } from "@/lib/finance/types";
import { ExportDialog } from "@/components/finance/ExportDialog";

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
  const { loading, error, ledger, monthly, totals, settings, rates, reload } = useFinanceData();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="text-label uppercase">Finanzas</span>
          <h1 className="text-h1 mt-1">Panel financiero</h1>
          <p className="text-body mt-2 text-muted-foreground">
            Ingresos, gastos y beneficio neto real. Impuestos orientativos — validar con el gestor.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Button className="flex-1 gap-2 sm:flex-none" onClick={() => setExportOpen(true)}>
            <FileDown className="h-4 w-4" /> Exportar para Gestor
          </Button>
          <Button
            variant="outline"
            className="flex-1 gap-2 sm:flex-none"
            onClick={() => setSettingsOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" /> Ajustes
          </Button>
        </div>
      </div>

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} defaultDataset="both" />

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
                  <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[160px_1fr]">
                    <div className="mx-auto h-[160px] w-[160px] sm:mx-0">
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
                    <li
                      key={c.teacher}
                      className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    >
                      <span className="min-w-0 truncate font-medium">{c.teacher}</span>
                      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
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

      <FinanceSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        rates={rates}
        onSaved={reload}
      />
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

function PctField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function FinanceSettingsSheet({
  open,
  onOpenChange,
  settings,
  rates,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  settings: FinanceSettings;
  rates: CommissionRateRow[];
  onSaved: () => void;
}) {
  const [iva, setIva] = useState("");
  const [irpf, setIrpf] = useState("");
  const [declared, setDeclared] = useState("");
  const [feeRevolut, setFeeRevolut] = useState("");
  const [feeBizum, setFeeBizum] = useState("");
  const [teacherPcts, setTeacherPcts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIva(pctToInput(settings.iva_rate));
    setIrpf(pctToInput(settings.irpf_rate));
    setDeclared(pctToInput(settings.declared_pct));
    setFeeRevolut(pctToInput(settings.fee_revolut_pct));
    setFeeBizum(pctToInput(settings.fee_bizum_pct));
    setTeacherPcts(Object.fromEntries(rates.map((r) => [r.teacher, pctToInput(r.default_pct)])));
  }, [open, settings, rates]);

  const save = async () => {
    setSaving(true);
    const num = (s: string, fallback: number) => {
      const v = inputToPct(s);
      return v == null ? fallback : v;
    };
    const stamp = new Date().toISOString();
    const { error: e1 } = await tbl("finance_settings").upsert({
      id: 1,
      iva_rate: num(iva, settings.iva_rate),
      irpf_rate: num(irpf, settings.irpf_rate),
      declared_pct: num(declared, settings.declared_pct),
      fee_revolut_pct: num(feeRevolut, settings.fee_revolut_pct),
      fee_bizum_pct: num(feeBizum, settings.fee_bizum_pct),
      updated_at: stamp,
    });
    let e2: { message: string } | null = null;
    if (rates.length) {
      const payloads = rates.map((r) => ({
        teacher: r.teacher,
        default_pct: num(teacherPcts[r.teacher] ?? "", r.default_pct),
        active: r.active,
        updated_at: stamp,
      }));
      ({ error: e2 } = await tbl("commission_rates").upsert(payloads));
    }
    setSaving(false);
    const err = e1 || e2;
    if (err) {
      toast.error("No se pudieron guardar los ajustes", { description: err.message });
      return;
    }
    toast.success("Ajustes guardados");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Ajustes financieros</SheetTitle>
          <SheetDescription>
            Impuestos y comisiones. Orientativo — validar con el gestor.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4 px-4 pb-8">
          <PctField id="iva" label="IVA (%)" value={iva} onChange={setIva} />
          <PctField id="irpf" label="IRPF (%)" value={irpf} onChange={setIrpf} />
          <PctField id="declared" label="% declarado (paga IVA/IRPF)" value={declared} onChange={setDeclared} />
          <PctField id="feeRevolut" label="Comisión sobre método T (%)" value={feeRevolut} onChange={setFeeRevolut} />
          <PctField id="feeBizum" label="Comisión sobre método B (%)" value={feeBizum} onChange={setFeeBizum} />
          {rates.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-label mb-2 uppercase text-muted-foreground">Comisión por profesora</p>
              <div className="space-y-3">
                {rates.map((r) => (
                  <PctField
                    key={r.teacher}
                    id={`t_${r.teacher}`}
                    label={`${r.teacher} (%)`}
                    value={teacherPcts[r.teacher] ?? ""}
                    onChange={(v) => setTeacherPcts((p) => ({ ...p, [r.teacher]: v }))}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
