import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { addMonths, formatLongDate, formatTimeRange } from "@/lib/calendar";
import { useMonthClasses, type ClassWithCount } from "@/hooks/useMonthClasses";
import { MonthHeader } from "@/components/calendar/MonthHeader";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { MobileWeekList } from "@/components/calendar/MobileWeekList";
import { bookClass } from "@/lib/booking";

export const Route = createFileRoute("/app/recuperaciones")({
  component: RecuperacionesPage,
});

type Makeup = {
  id: string;
  expires_at: string;
  used_booking_id: string | null;
  source_booking_id: string;
};

function RecuperacionesPage() {
  const { user } = useAuth();
  const [makeups, setMakeups] = useState<Makeup[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [reference, setReference] = useState(() => new Date());
  const [selected, setSelected] = useState<ClassWithCount | null>(null);
  const { classes, loading: loadingClasses, refresh } = useMonthClasses(reference, "student");
  const [bookedClassIds, setBookedClassIds] = useState<Set<string>>(new Set());

  const fetchMakeups = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("makeups")
      .select("id, expires_at, used_booking_id, source_booking_id")
      .eq("student_id", user.id)
      .is("used_booking_id", null)
      .gte("expires_at", nowIso)
      .order("expires_at", { ascending: true });
    if (error) {
      toast.error("No se pudieron cargar tus recuperaciones", { description: error.message });
      setMakeups([]);
    } else {
      setMakeups((data ?? []) as Makeup[]);
    }
    setLoading(false);
  }, [user]);

  const fetchMyBookings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("bookings")
      .select("class_id, status")
      .eq("student_id", user.id)
      .in("status", ["reserved", "confirmed", "attended"]);
    setBookedClassIds(new Set((data ?? []).map((b) => b.class_id)));
  }, [user]);

  useEffect(() => {
    void fetchMakeups();
    void fetchMyBookings();
  }, [fetchMakeups, fetchMyBookings]);

  // Realtime: refresh makeups list on changes for this user.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`my-makeups-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "makeups", filter: `student_id=eq.${user.id}` },
        () => void fetchMakeups(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `student_id=eq.${user.id}` },
        () => {
          void fetchMyBookings();
          void fetchMakeups();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, fetchMakeups, fetchMyBookings]);

  const remaining = makeups.length;

  // Available classes for redeeming a makeup: not full, not already booked.
  const eligible = classes.filter(
    (c) => c.booked_count < c.capacity_max && !bookedClassIds.has(c.id),
  );

  const handleRedeem = async () => {
    if (!selected || makeups.length === 0) return;
    setPicking(true);
    try {
      const res = await bookClass(selected.id, "drop_in");
      // Mark the oldest unused makeup as used by this booking.
      const oldest = makeups[0];
      const { error } = await supabase
        .from("makeups")
        .update({ used_booking_id: res.booking_id })
        .eq("id", oldest.id);
      if (error) throw new Error(error.message);
      toast.success("Recuperación reservada");
      setSelected(null);
      await Promise.all([fetchMakeups(), fetchMyBookings(), refresh()]);
    } catch (err) {
      toast.error("No se pudo reservar la recuperación", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <span className="text-label uppercase">Tus créditos</span>
        <h1 className="text-h1 mt-1">Recuperaciones</h1>
        <p className="text-body mt-2 text-muted-foreground">
          Te quedan <strong>{loading ? "—" : remaining}</strong>{" "}
          {remaining === 1 ? "clase" : "clases"} por recuperar este mes.
        </p>
      </div>

      {!loading && makeups.length > 0 ? (
        <ul className="space-y-2">
          {makeups.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 text-sm shadow-card"
            >
              <span>Crédito de recuperación</span>
              <Badge variant="outline">
                Caduca {new Date(m.expires_at).toLocaleDateString("es-ES")}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-h2">Reservar recuperación</h2>
          <p className="text-xs text-muted-foreground">
            Solo se muestran clases con plazas disponibles que aún no has reservado.
          </p>
        </div>

        <MonthHeader
          reference={reference}
          onPrev={() => setReference((d) => addMonths(d, -1))}
          onNext={() => setReference((d) => addMonths(d, 1))}
          onToday={() => setReference(new Date())}
        />

        <div className="lg:hidden">
          <MobileWeekList
            reference={reference}
            classes={eligible}
            onSelectClass={setSelected}
          />
        </div>
        <div className="hidden lg:block">
          {loadingClasses ? (
            <div className="grid grid-cols-7 gap-px rounded-xl border border-border bg-border p-px shadow-card">
              {Array.from({ length: 42 }).map((_, i) => (
                <div key={i} className="h-[110px] animate-pulse bg-surface" />
              ))}
            </div>
          ) : (
            <MonthGrid reference={reference} classes={eligible} onSelectClass={setSelected} />
          )}
        </div>
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="capitalize">
              {selected ? formatLongDate(selected.date) : ""}
            </SheetTitle>
            <SheetDescription>
              {selected ? formatTimeRange(selected.start_time, selected.end_time) : ""}
            </SheetDescription>
          </SheetHeader>
          {selected ? (
            <div className="mt-6 space-y-4 px-4">
              <p className="text-sm text-muted-foreground">
                Vas a usar uno de tus créditos de recuperación para esta clase.
              </p>
              <Button
                className="w-full"
                size="lg"
                onClick={handleRedeem}
                disabled={picking || remaining === 0}
              >
                {picking
                  ? "Reservando…"
                  : remaining === 0
                    ? "Sin recuperaciones disponibles"
                    : "Reservar recuperación"}
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}