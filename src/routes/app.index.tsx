import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  capacityDotClass,
  capacityLabel,
  capacityLevel,
  formatLongDate,
  formatTimeRange,
  toIsoDate,
} from "@/lib/calendar";
import { useClassesInRange, type ClassWithCount } from "@/hooks/useClassesInRange";
import { useMyPlan } from "@/hooks/useMyPlan";
import { bookClass } from "@/lib/booking";
import { joinWaitlist } from "@/lib/waitlist";
import { createDropInCheckout } from "@/lib/checkout";
import { StripeCheckoutDialog } from "@/components/StripeCheckoutDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  calendarSearchSchema,
  parseReference,
  rangeForView,
  shiftReference,
  type CalendarView,
} from "@/lib/calendar-view";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { CalendarBoard } from "@/components/calendar/CalendarBoard";

function parseIsoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const Route = createFileRoute("/app/")({
  validateSearch: (search) => calendarSearchSchema.parse(search),
  component: CalendarioPage,
});

function CalendarioPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const view: CalendarView = search.view ?? "month";
  const reference = useMemo(() => parseReference(search.date), [search.date]);
  const range = useMemo(() => rangeForView(view, reference), [view, reference]);

  const [selected, setSelected] = useState<ClassWithCount | null>(null);
  const { classes, loading, refresh } = useClassesInRange(range, "student");

  const setView = (v: CalendarView) =>
    navigate({ search: (prev) => ({ ...prev, view: v }) });
  const shift = (dir: -1 | 1) =>
    navigate({ search: (prev) => ({ ...prev, date: toIsoDate(shiftReference(view, reference, dir)) }) });
  const goToday = () =>
    navigate({ search: (prev) => ({ ...prev, date: toIsoDate(new Date()) }) });

  return (
    <div className="space-y-6">
      <div>
        <span className="text-label uppercase">Tu mes</span>
        <h1 className="text-h1 mt-1">Calendario</h1>
        <p className="text-body mt-2 text-muted-foreground">
          Clases — toca una clase para ver los detalles.
        </p>
      </div>

      <CalendarHeader
        view={view}
        reference={reference}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onToday={goToday}
        onViewChange={setView}
        rightSlot={
          <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
            <Legend />
          </div>
        }
      />

      <CalendarBoard
        view={view}
        reference={reference}
        classes={classes}
        loading={loading}
        onSelectClass={setSelected}
      />

      <div className="flex items-center gap-3 text-xs text-muted-foreground sm:hidden">
        <Legend />
      </div>

      <ClassDetailsSheet
        cls={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onBooked={() => {
          setSelected(null);
          void refresh();
        }}
      />
    </div>
  );
}

function Legend() {
  return (
    <>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-success" /> Disponible
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-warning" /> Casi completa
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-destructive" /> Completa
      </span>
    </>
  );
}

function ClassDetailsSheet({
  cls,
  onOpenChange,
  onBooked,
}: {
  cls: ClassWithCount | null;
  onOpenChange: (open: boolean) => void;
  onBooked: () => void;
}) {
  const open = cls !== null;
  const level = cls ? capacityLevel(cls.booked_count, cls.capacity_max) : "available";
  const available = cls ? Math.max(cls.capacity_max - cls.booked_count, 0) : 0;
  // Look up the credits for the class's month (not necessarily the visible one).
  const planMonth = cls ? parseIsoToLocalDate(cls.date) : undefined;
  const { creditsRemaining } = useMyPlan(planMonth);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const [waitlistCount, setWaitlistCount] = useState(0);
  const [myWaitlistId, setMyWaitlistId] = useState<string | null>(null);
  const [joiningWl, setJoiningWl] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);

  const isFull = cls ? cls.booked_count >= cls.capacity_max : true;
  const usePlan = (creditsRemaining ?? 0) > 0;

  useEffect(() => {
    if (!cls) {
      setWaitlistCount(0);
      setMyWaitlistId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data: rows, error } = await supabase
        .from("waitlist")
        .select("id, student_id")
        .eq("class_id", cls.id);
      if (cancelled || error) return;
      setWaitlistCount(rows?.length ?? 0);
      const mine = user ? rows?.find((r) => r.student_id === user.id) : null;
      setMyWaitlistId(mine?.id ?? null);
    })();
    const ch = supabase
      .channel(`waitlist-${cls.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waitlist", filter: `class_id=eq.${cls.id}` },
        async () => {
          const { data: rows } = await supabase
            .from("waitlist")
            .select("id, student_id")
            .eq("class_id", cls.id);
          if (cancelled) return;
          setWaitlistCount(rows?.length ?? 0);
          const mine = user ? rows?.find((r) => r.student_id === user.id) : null;
          setMyWaitlistId(mine?.id ?? null);
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [cls, user]);

  const handleBook = async () => {
    if (!cls) return;
    setSubmitting(true);
    try {
      const res = await bookClass(cls.id, usePlan ? "plan" : "drop_in");
      if (usePlan) {
        toast.success("Clase reservada");
        onBooked();
      } else {
        // Drop-in: open Stripe checkout for this booking
        setPendingBookingId(res.booking_id);
        setCheckoutOpen(true);
      }
    } catch (err) {
      toast.error("No se pudo reservar", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinWaitlist = async () => {
    if (!cls) return;
    setJoiningWl(true);
    try {
      const res = await joinWaitlist(cls.id);
      toast.success("Te has unido a la lista de espera", {
        description: `Posición ${res.pos}. Te avisaremos si se libera un sitio.`,
      });
    } catch (err) {
      toast.error("No se pudo unir a la lista de espera", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setJoiningWl(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="capitalize">
            {cls ? formatLongDate(cls.date) : ""}
          </SheetTitle>
          <SheetDescription>
            {cls ? formatTimeRange(cls.start_time, cls.end_time) : ""}
          </SheetDescription>
        </SheetHeader>
        {cls ? (
          <div className="mt-6 space-y-5 px-4">
            <div className="flex items-center gap-2">
              <span className={["h-2.5 w-2.5 rounded-full", capacityDotClass(level)].join(" ")} />
              <Badge variant="secondary">{capacityLabel(level)}</Badge>
              {isFull && waitlistCount > 0 ? (
                <Badge variant="outline">{waitlistCount} en lista de espera</Badge>
              ) : null}
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-label">Capacidad</dt>
                <dd className="font-medium tabular-nums">{cls.capacity_max}</dd>
              </div>
              <div>
                <dt className="text-label">Reservadas</dt>
                <dd className="font-medium tabular-nums">{cls.booked_count}</dd>
              </div>
              <div>
                <dt className="text-label">Cupos disponibles</dt>
                <dd className="font-medium tabular-nums">{available}</dd>
              </div>
              <div>
                <dt className="text-label">Plazas ideales</dt>
                <dd className="font-medium tabular-nums">{cls.capacity_ideal}</dd>
              </div>
            </dl>
            {isFull ? (
              <Button
                className="w-full"
                size="lg"
                variant="secondary"
                onClick={handleJoinWaitlist}
                disabled={joiningWl || myWaitlistId !== null}
              >
                {myWaitlistId !== null
                  ? "Ya estás en la lista de espera"
                  : joiningWl
                    ? "Uniéndote…"
                    : "Unirme a la lista de espera"}
              </Button>
            ) : (
              <Button className="w-full" size="lg" onClick={handleBook} disabled={submitting}>
                {submitting
                  ? "Reservando…"
                  : usePlan
                    ? `Reservar con mi plan (${creditsRemaining} restantes)`
                    : "Reservar clase suelta"}
              </Button>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
      <StripeCheckoutDialog
        open={checkoutOpen}
        onOpenChange={(o) => {
          setCheckoutOpen(o);
          if (!o) {
            setPendingBookingId(null);
            onBooked();
          }
        }}
        title="Pagar clase suelta"
        fetchClientSecret={async () => {
          if (!pendingBookingId) throw new Error("No booking");
          const returnUrl = `${window.location.origin}/app/pago-exitoso?session_id={CHECKOUT_SESSION_ID}`;
          const { clientSecret } = await createDropInCheckout({
            bookingId: pendingBookingId,
            returnUrl,
          });
          return clientSecret;
        }}
      />
    </>
  );
}
