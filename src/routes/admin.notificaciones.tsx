import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

type StatusFilter = "all" | "queued" | "sent" | "failed";

type Row = {
  id: string;
  created_at: string;
  sent_at: string | null;
  type: string;
  channel: string;
  status: string;
  retry_count: number;
  last_error: string | null;
  student_id: string;
  profiles: { name: string | null; surname: string | null; email: string | null } | null;
};

export const Route = createFileRoute("/admin/notificaciones")({
  head: () => ({ meta: [{ title: "Notificaciones — Admin" }] }),
  component: NotificationsPage,
});

const TYPE_LABEL: Record<string, string> = {
  reservation_confirmed: "Reserva confirmada",
  plan_purchased: "Plan activado",
  reminder_24h: "Recordatorio 24h",
  class_cancelled: "Clase cancelada",
  makeup_available: "Recuperación disponible",
  waitlist_promoted: "Plaza desde lista de espera",
  monthly_summary: "Resumen mensual",
};

function NotificationsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let q = supabase
        .from("notifications")
        .select(
          "id, created_at, sent_at, type, channel, status, retry_count, last_error, student_id, profiles!notifications_student_id_fkey(name, surname, email)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        setRows([]);
        return;
      }
      setRows((data ?? []) as unknown as Row[]);
    };
    void load();
    const ch = supabase
      .channel("admin-notifications-log")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => void load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [filter]);

  const counts = useMemo(() => {
    const c = { queued: 0, sent: 0, failed: 0 };
    for (const r of rows ?? []) {
      if (r.status === "queued" || r.status === "sending") c.queued++;
      else if (r.status === "sent") c.sent++;
      else if (r.status === "failed") c.failed++;
    }
    return c;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-label uppercase">Operaciones</span>
          <h1 className="text-h1 mt-1">Notificaciones</h1>
          <p className="text-body mt-2 text-muted-foreground">
            Últimas 200 notificaciones enviadas o en cola.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">En cola: {counts.queued}</Badge>
          <Badge variant="outline">Enviadas: {counts.sent}</Badge>
          <Badge variant="outline">Fallidas: {counts.failed}</Badge>
          <Select value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="queued">En cola</SelectItem>
              <SelectItem value="sent">Enviadas</SelectItem>
              <SelectItem value="failed">Fallidas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        {rows === null ? (
          <div className="p-6 text-sm text-muted-foreground">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Sin notificaciones.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Fecha</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Alumna</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Tipo</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Canal</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Estado</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const fullName =
                    [r.profiles?.name, r.profiles?.surname].filter(Boolean).join(" ") ||
                    r.profiles?.email ||
                    r.student_id.slice(0, 8);
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("es-ES", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2 font-medium">{fullName}</td>
                      <td className="px-3 py-2">{TYPE_LABEL[r.type] ?? r.type}</td>
                      <td className="px-3 py-2 capitalize">{r.channel}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {r.last_error
                          ? `${r.last_error}${r.retry_count > 0 ? ` (intentos: ${r.retry_count})` : ""}`
                          : r.sent_at
                            ? `Enviada ${new Date(r.sent_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`
                            : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "sent") return <Badge variant="secondary">Enviada</Badge>;
  if (status === "failed") return <Badge variant="destructive">Fallida</Badge>;
  if (status === "sending") return <Badge variant="outline">Enviando…</Badge>;
  return <Badge variant="outline">En cola</Badge>;
}