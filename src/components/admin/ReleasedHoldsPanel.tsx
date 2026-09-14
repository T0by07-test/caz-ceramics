import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatLongDate, formatTimeRange, toIsoDate } from "@/lib/calendar";

type ReleasedRow = {
  id: string;
  cancelled_at: string | null;
  classes: {
    date: string;
    start_time: string;
    end_time: string;
    teacher: string | null;
    audience: string;
  } | null;
  profiles: { name: string | null; surname: string | null; email: string | null } | null;
  payments: { amount_cents: number; status: string; method: string | null }[] | null;
};

function formatEur(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/**
 * Reservations the system released because the card payment never completed.
 * Cande sees them here (upcoming classes only) and can give the seat back as
 * pending cash with one click.
 */
export function ReleasedHoldsPanel() {
  const [rows, setRows] = useState<ReleasedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("bookings")
      .select(
        "id, cancelled_at, classes!inner(date, start_time, end_time, teacher, audience), profiles:student_id(name, surname, email), payments(amount_cents, status, method)",
      )
      .eq("source", "drop_in")
      .eq("status", "cancelled_lost")
      .gte("classes.date", toIsoDate(new Date()))
      .order("cancelled_at", { ascending: false })
      .limit(50);
    setRows((data ?? []) as unknown as ReleasedRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (id: string) => {
    setRestoring(id);
    const { error } = await supabase.rpc("admin_restore_released_booking", { p_booking_id: id });
    setRestoring(null);
    if (error) {
      toast.error("No se pudo devolver la plaza", { description: error.message });
      return;
    }
    toast.success("Plaza devuelta", {
      description: "Queda reservada con el pago pendiente en efectivo.",
    });
    void load();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) return null;

  return (
    <Card className="border-destructive/40">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <h2 className="text-h3">Reservas caídas sin pagar</h2>
            <p className="text-xs text-muted-foreground">
              Eligieron pagar con tarjeta pero no completaron el pago, así que el sistema liberó la
              plaza. Puedes devolvérsela y dejarla pendiente de cobro en efectivo.
            </p>
          </div>
        </div>
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const name =
              [r.profiles?.name, r.profiles?.surname].filter(Boolean).join(" ").trim() ||
              r.profiles?.email ||
              "—";
            const amount = Math.max(0, ...(r.payments ?? []).map((p) => p.amount_cents ?? 0));
            return (
              <li
                key={r.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{name}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {r.classes ? formatLongDate(r.classes.date) : "—"}
                    {r.classes ? ` · ${formatTimeRange(r.classes.start_time, r.classes.end_time)}` : ""}
                    {r.classes?.teacher ? ` · ${r.classes.teacher}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {amount > 0 ? <Badge variant="secondary">{formatEur(amount)}</Badge> : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={restoring === r.id}
                    onClick={() => void restore(r.id)}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Devolver la plaza
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
