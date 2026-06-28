import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { RouteGuard } from "@/components/RouteGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/pagos")({
  head: () => ({ meta: [{ title: "Pagos — Admin" }] }),
  component: AdminPaymentsRoute,
});

type StatusFilter = "all" | "pending" | "confirmed" | "failed";

type Row = {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  stripe_session_id: string | null;
  student_id: string;
  subscription_id: string | null;
  booking_id: string | null;
  student_name: string;
};

function formatEur(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
}

function statusBadge(status: string) {
  if (status === "confirmed")
    return <Badge className="bg-success text-success-foreground">Confirmado</Badge>;
  if (status === "failed") return <Badge variant="destructive">Fallido</Badge>;
  return <Badge variant="secondary">Pendiente</Badge>;
}

function AdminPaymentsRoute() {
  return (
    <RouteGuard requireAdmin>
      <AdminPaymentsPage />
    </RouteGuard>
  );
}

function AdminPaymentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("all");
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      let q = supabase
        .from("payments")
        .select(
          "id, amount_cents, status, created_at, stripe_session_id, student_id, subscription_id, booking_id",
        )
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (status !== "all") q = q.eq("status", status);
      const { data: payments } = await q;
      const ids = Array.from(new Set((payments ?? []).map((p) => p.student_id)));
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, name, surname, email").in("id", ids)
        : { data: [] as { id: string; name: string | null; surname: string | null; email: string | null }[] };
      const profById = new Map((profiles ?? []).map((p) => [p.id, p]));
      const result: Row[] = (payments ?? []).map((p) => {
        const prof = profById.get(p.student_id);
        const name =
          [prof?.name, prof?.surname].filter(Boolean).join(" ").trim() ||
          prof?.email ||
          "—";
        return { ...p, student_name: name };
      });
      if (cancelled) return;
      setRows(result);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [status, from, to]);

  const totals = useMemo(() => {
    const confirmed = rows.filter((r) => r.status === "confirmed");
    return {
      count: rows.length,
      sum_confirmed: confirmed.reduce((s, r) => s + r.amount_cents, 0),
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <span className="text-label uppercase">Finanzas</span>
        <h1 className="text-h1 mt-1">Pagos</h1>
        <p className="text-body mt-2 text-muted-foreground">
          Filtra por estado y fechas. Abre la sesión en Stripe para más detalles.
        </p>
      </div>

      <Card className="shadow-card">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="status">Estado</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger id="status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="confirmed">Confirmados</SelectItem>
                <SelectItem value="failed">Fallidos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="from">Desde</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">Hasta</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex flex-col justify-end">
            <p className="text-xs text-muted-foreground">
              {totals.count} resultados · Confirmado:{" "}
              <span className="font-semibold text-foreground">
                {formatEur(totals.sum_confirmed)}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Sin pagos en este rango"
                description="Ajusta los filtros para ver más resultados."
              />
            </div>
          ) : (
            <>
            <ul className="divide-y divide-border md:hidden">
              {rows.map((r) => (
                <li key={`m-${r.id}`} className="space-y-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.student_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("es-ES")} ·{" "}
                        {r.subscription_id ? "Plan" : r.booking_id ? "Clase suelta" : "—"}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{formatEur(r.amount_cents)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {statusBadge(r.status)}
                    {r.stripe_session_id ? (
                      <a
                        href={`https://dashboard.stripe.com/test/payments/${r.stripe_session_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Stripe <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Alumna</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead className="text-right">Stripe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("es-ES")}
                    </TableCell>
                    <TableCell className="font-medium">{r.student_name}</TableCell>
                    <TableCell>
                      {r.subscription_id ? "Plan" : r.booking_id ? "Clase suelta" : "—"}
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatEur(r.amount_cents)}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.stripe_session_id ? (
                        <a
                          href={`https://dashboard.stripe.com/test/payments/${r.stripe_session_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          aria-label="Ver en Stripe"
                        >
                          Ver <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}