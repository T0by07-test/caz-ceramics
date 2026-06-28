import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cancelBooking, isRecoverableNow } from "@/lib/booking";
import { leaveWaitlist } from "@/lib/waitlist";
import { formatLongDate, formatTimeRange } from "@/lib/calendar";

export const Route = createFileRoute("/app/reservas")({
  component: MisReservasPage,
});

type Row = {
  id: string;
  status: string;
  source: string;
  cancelled_at: string | null;
  created_at: string;
  classes: {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    status: string;
  } | null;
};

type WaitRow = {
  id: string;
  position: number;
  classes: {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
  } | null;
};

function MisReservasPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [waitlist, setWaitlist] = useState<WaitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toCancel, setToCancel] = useState<Row | null>(null);

  const fetchRows = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [bookingsRes, waitlistRes] = await Promise.all([
      supabase
      .from("bookings")
      .select(
        "id, status, source, cancelled_at, created_at, classes ( id, date, start_time, end_time, status )",
      )
      .eq("student_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("waitlist")
        .select("id, position, classes ( id, date, start_time, end_time )")
        .eq("student_id", user.id)
        .order("position", { ascending: true }),
    ]);
    if (bookingsRes.error) {
      toast.error("No se pudieron cargar tus reservas", {
        description: bookingsRes.error.message,
      });
      setRows([]);
    } else {
      setRows((bookingsRes.data ?? []) as unknown as Row[]);
    }
    if (waitlistRes.error) {
      setWaitlist([]);
    } else {
      setWaitlist((waitlistRes.data ?? []) as unknown as WaitRow[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  // Realtime: refresh when this user's bookings change.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`my-bookings-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `student_id=eq.${user.id}` },
        () => void fetchRows(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waitlist", filter: `student_id=eq.${user.id}` },
        () => void fetchRows(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, fetchRows]);

  const now = Date.now();
  const upcoming = rows.filter(
    (r) =>
      r.classes &&
      ["reserved", "confirmed"].includes(r.status) &&
      classStartMs(r.classes) >= now,
  );
  const past = rows.filter(
    (r) =>
      r.classes &&
      ["confirmed", "attended", "reserved"].includes(r.status) &&
      classStartMs(r.classes) < now,
  );
  const cancelled = rows.filter((r) =>
    ["cancelled_recoverable", "cancelled_lost"].includes(r.status),
  );

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <span className="text-label uppercase">Tu actividad</span>
        <h1 className="text-h1 mt-1">Mis reservas</h1>
        <p className="text-body mt-2 text-muted-foreground">
          Consulta tus próximas clases y gestiona cancelaciones.
        </p>
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList className="grid w-full grid-cols-2 gap-1 sm:inline-flex sm:w-auto sm:gap-0">
          <TabsTrigger value="upcoming">Próximas</TabsTrigger>
          <TabsTrigger value="past">Pasadas</TabsTrigger>
          <TabsTrigger value="cancelled">Canceladas</TabsTrigger>
          <TabsTrigger value="waitlist">Espera</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming" className="mt-4">
          <BookingList
            rows={upcoming}
            loading={loading}
            empty="No tienes próximas reservas."
            onCancel={(r) => setToCancel(r)}
          />
        </TabsContent>
        <TabsContent value="past" className="mt-4">
          <BookingList rows={past} loading={loading} empty="Aún no hay clases pasadas." />
        </TabsContent>
        <TabsContent value="cancelled" className="mt-4">
          <BookingList rows={cancelled} loading={loading} empty="No tienes cancelaciones." />
        </TabsContent>
        <TabsContent value="waitlist" className="mt-4">
          <WaitlistList
            rows={waitlist}
            loading={loading}
            onLeave={async (id) => {
              try {
                await leaveWaitlist(id);
                toast.success("Has salido de la lista de espera");
                void fetchRows();
              } catch (err) {
                toast.error("No se pudo salir", {
                  description: err instanceof Error ? err.message : undefined,
                });
              }
            }}
          />
        </TabsContent>
      </Tabs>

      <CancelDialog
        row={toCancel}
        onOpenChange={(open) => !open && setToCancel(null)}
        onCancelled={() => {
          setToCancel(null);
          void fetchRows();
        }}
      />
    </div>
  );
}

function classStartMs(c: NonNullable<Row["classes"]>): number {
  const [y, m, d] = c.date.split("-").map(Number);
  const [hh, mm] = c.start_time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0).getTime();
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    reserved: { label: "Reservada", variant: "secondary" },
    confirmed: { label: "Confirmada", variant: "default" },
    attended: { label: "Asistida", variant: "outline" },
    cancelled_recoverable: { label: "Cancelada · recuperable", variant: "outline" },
    cancelled_lost: { label: "Cancelada · perdida", variant: "destructive" },
  };
  const m = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function BookingList({
  rows,
  loading,
  empty,
  onCancel,
}: {
  rows: Row[];
  loading: boolean;
  empty: string;
  onCancel?: (r: Row) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-surface" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground shadow-card">
        {empty}
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.id}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold capitalize">
              {r.classes ? formatLongDate(r.classes.date) : "Clase"}
            </div>
            <div className="text-xs text-muted-foreground">
              {r.classes ? formatTimeRange(r.classes.start_time, r.classes.end_time) : ""} ·{" "}
              {r.source === "plan" ? "Plan mensual" : "Clase suelta"}
            </div>
            <div className="mt-2">{statusBadge(r.status)}</div>
          </div>
          {onCancel && r.classes ? (
            <Button variant="outline" onClick={() => onCancel(r)}>
              Cancelar
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function CancelDialog({
  row,
  onOpenChange,
  onCancelled,
}: {
  row: Row | null;
  onOpenChange: (open: boolean) => void;
  onCancelled: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const recoverable = row?.classes
    ? isRecoverableNow(row.classes.date, row.classes.start_time)
    : false;

  const handleConfirm = async () => {
    if (!row) return;
    setSubmitting(true);
    try {
      const res = await cancelBooking(row.id);
      if (res.status === "cancelled_recoverable") {
        toast.success("Reserva cancelada", {
          description: "Se ha añadido un crédito de recuperación válido este mes.",
        });
      } else {
        toast.success("Reserva cancelada", {
          description: "La cancelación se realizó dentro de las 3 horas previas: el crédito se ha perdido.",
        });
      }
      onCancelled();
    } catch (err) {
      toast.error("No se pudo cancelar", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={row !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar reserva</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                Si cancelas con <strong>más de 3 horas</strong> de antelación,
                conservas el crédito como recuperación válida durante el mismo mes.
              </p>
              <p>
                Si cancelas con <strong>menos de 3 horas</strong> de antelación,
                el crédito se pierde.
              </p>
              <p
                className={
                  recoverable
                    ? "rounded-md bg-success/10 px-3 py-2 text-success-foreground"
                    : "rounded-md bg-destructive/10 px-3 py-2 text-destructive-foreground"
                }
              >
                {recoverable
                  ? "Esta cancelación sería recuperable."
                  : "Esta cancelación se consideraría perdida."}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Volver</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Cancelando…" : "Confirmar cancelación"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function WaitlistList({
  rows,
  loading,
  onLeave,
}: {
  rows: WaitRow[];
  loading: boolean;
  onLeave: (id: string) => void | Promise<void>;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-surface" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground shadow-card">
        No estás en ninguna lista de espera.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((w) => (
        <li
          key={w.id}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold capitalize">
              {w.classes ? formatLongDate(w.classes.date) : "Clase"}
            </div>
            <div className="text-xs text-muted-foreground">
              {w.classes ? formatTimeRange(w.classes.start_time, w.classes.end_time) : ""}
            </div>
            <div className="mt-2">
              <Badge variant="outline">Posición {w.position}</Badge>
            </div>
          </div>
          <Button variant="outline" onClick={() => void onLeave(w.id)}>
            Salir de la lista
          </Button>
        </li>
      ))}
    </ul>
  );
}