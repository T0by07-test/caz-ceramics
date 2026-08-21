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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Banknote, CreditCard, Smartphone, X } from "lucide-react";
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
import { createPlanCheckout } from "@/lib/checkout";
import { StripeCheckoutDialog } from "@/components/StripeCheckoutDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useActivePlans, planForCount, formatEuros, type Plan } from "@/lib/plan-pricing";
import { savePendingBookings } from "@/lib/pending-bookings";
import {
  calendarSearchSchema,
  parseReference,
  rangeForView,
  shiftReference,
  type CalendarView,
  type CalendarSearch,
} from "@/lib/calendar-view";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { CalendarBoard } from "@/components/calendar/CalendarBoard";


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

  const [full, setFull] = useState<ClassWithCount | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const { classes, loading, refresh } = useClassesInRange(range, "student");
  const { hasPlan } = useMyPlan(reference);

  const selectedClasses = useMemo(
    () => classes.filter((c) => selectedIds.has(c.id)),
    [classes, selectedIds],
  );

  const setView = (v: CalendarView) =>
    navigate({ search: (prev: CalendarSearch) => ({ ...prev, view: v }) });
  const shift = (dir: -1 | 1) =>
    navigate({
      search: (prev: CalendarSearch) => ({
        ...prev,
        date: toIsoDate(shiftReference(view, reference, dir)),
      }),
    });
  const goToday = () =>
    navigate({ search: (prev: CalendarSearch) => ({ ...prev, date: toIsoDate(new Date()) }) });

  const handleSelectClass = (c: ClassWithCount) => {
    if (c.status !== "scheduled") return;
    if (c.booked_count >= c.capacity_max) {
      setFull(c);
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.add(c.id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selectedClasses.length === 0) return;
    if (!hasPlan && selectedClasses.length > 1) {
      toast.error("Para reservar varias clases necesitas un plan mensual", {
        description: "Elige un plan en «Planes» y reserva todas las clases que quieras.",
      });
      return;
    }
    setSubmitting(true);
    const ordered = [...selectedClasses].sort((a, b) =>
      `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`),
    );
    if (!hasPlan) {
      try {
        const res = await bookClass(ordered[0].id, "drop_in");
        setSelectedIds(new Set());
        setPendingBookingId(res.booking_id);
      } catch (err) {
        toast.error("No se pudo reservar", {
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    let ok = 0;
    const failed: string[] = [];
    for (const c of ordered) {
      try {
        await bookClass(c.id, "plan");
        ok += 1;
      } catch (err) {
        failed.push(
          `${formatLongDate(c.date)} · ${formatTimeRange(c.start_time, c.end_time)}${
            err instanceof Error ? ` — ${err.message}` : ""
          }`,
        );
      }
    }
    setSubmitting(false);
    setSelectedIds(new Set());
    if (ok > 0) {
      toast.success(ok === 1 ? "Clase reservada" : `${ok} clases reservadas`);
    }
    if (failed.length > 0) {
      toast.error("Algunas clases no se pudieron reservar", {
        description: failed.join(" | "),
      });
    }
    void refresh();
  };

  return (
    <div className="space-y-6 pb-24">
      <div>
        <span className="text-label uppercase">Tu mes</span>
        <h1 className="text-h1 mt-1">Calendario</h1>
        <p className="text-body mt-2 text-muted-foreground">
          Toca las clases a las que quieras venir y confirma tu reserva.
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
        onSelectClass={handleSelectClass}
        selectedIds={selectedIds}
      />

      <div className="flex items-center gap-3 text-xs text-muted-foreground sm:hidden">
        <Legend />
      </div>

      {selectedClasses.length > 0 ? (
        <SelectionBar
          classes={selectedClasses}
          hasPlan={hasPlan}
          submitting={submitting}
          onClear={() => setSelectedIds(new Set())}
          onConfirm={() => void handleConfirm()}
        />
      ) : null}

      <WaitlistSheet cls={full} onOpenChange={(open) => !open && setFull(null)} />

      <DropInPaymentFlow
        bookingId={pendingBookingId}
        onClose={() => {
          setPendingBookingId(null);
          void refresh();
        }}
      />
    </div>
  );
}

function SelectionBar({
  classes,
  hasPlan,
  submitting,
  onClear,
  onConfirm,
}: {
  classes: ClassWithCount[];
  hasPlan: boolean;
  submitting: boolean;
  onClear: () => void;
  onConfirm: () => void;
}) {
  const count = classes.length;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 p-3 shadow-card backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {count === 1 ? "1 clase seleccionada" : `${count} clases seleccionadas`}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {classes
              .map((c) => `${formatLongDate(c.date)} · ${formatTimeRange(c.start_time, c.end_time)}`)
              .join(" · ")}
          </div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Quitar selección" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
        <Button onClick={onConfirm} disabled={submitting}>
          {submitting
            ? "Reservando…"
            : hasPlan
              ? count === 1
                ? "Reservar clase"
                : `Reservar ${count} clases`
              : "Reservar y pagar"}
        </Button>
      </div>
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

function WaitlistSheet({
  cls,
  onOpenChange,
}: {
  cls: ClassWithCount | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = cls !== null;
  const level = cls ? capacityLevel(cls.booked_count, cls.capacity_max) : "available";
  const { user } = useAuth();
  const [waitlistCount, setWaitlistCount] = useState(0);
  const [myWaitlistId, setMyWaitlistId] = useState<string | null>(null);
  const [joiningWl, setJoiningWl] = useState(false);

  useEffect(() => {
    if (!cls) {
      setWaitlistCount(0);
      setMyWaitlistId(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data: rows, error } = await supabase
        .from("waitlist")
        .select("id, student_id")
        .eq("class_id", cls.id);
      if (cancelled || error) return;
      setWaitlistCount(rows?.length ?? 0);
      const mine = user ? rows?.find((r) => r.student_id === user.id) : null;
      setMyWaitlistId(mine?.id ?? null);
    };
    void load();
    const ch = supabase
      .channel(`waitlist-${cls.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waitlist", filter: `class_id=eq.${cls.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [cls, user]);

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="capitalize">{cls ? formatLongDate(cls.date) : ""}</SheetTitle>
          <SheetDescription>
            {cls ? formatTimeRange(cls.start_time, cls.end_time) : ""}
            {cls?.teacher ? ` · Profe ${cls.teacher}` : ""}
            {cls?.audience === "kids" ? " · Clase infantil" : ""}
          </SheetDescription>
        </SheetHeader>
        {cls ? (
          <div className="mt-6 space-y-5 px-4">
            <div className="flex items-center gap-2">
              <span className={["h-2.5 w-2.5 rounded-full", capacityDotClass(level)].join(" ")} />
              <Badge variant="secondary">{capacityLabel(level)}</Badge>
              {waitlistCount > 0 ? (
                <Badge variant="outline">{waitlistCount} en lista de espera</Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              Esta clase está completa. Únete a la lista de espera y te avisaremos si se libera un
              sitio.
            </p>
            <Button
              className="w-full"
              size="lg"
              variant="secondary"
              onClick={() => void handleJoinWaitlist()}
              disabled={joiningWl || myWaitlistId !== null}
            >
              {myWaitlistId !== null
                ? "Ya estás en la lista de espera"
                : joiningWl
                  ? "Uniéndote…"
                  : "Unirme a la lista de espera"}
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DropInPaymentFlow({
  bookingId,
  onClose,
}: {
  bookingId: string | null;
  onClose: () => void;
}) {
  const [methodOpen, setMethodOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [dropInMethod, setDropInMethod] = useState<"card" | "bizum">("card");
  const [cashLoading, setCashLoading] = useState(false);

  useEffect(() => {
    if (bookingId) setMethodOpen(true);
  }, [bookingId]);

  const handleDropInCash = async () => {
    if (!bookingId) return;
    setCashLoading(true);
    const { error } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>)("pay_drop_in_cash", {
      p_booking_id: bookingId,
    });
    setCashLoading(false);
    if (error) {
      toast.error("No se pudo reservar tu plaza", { description: error.message });
      return;
    }
    setMethodOpen(false);
    toast.success("Plaza reservada", {
      description: "Paga los 20 € en el estudio antes de la clase.",
    });
    onClose();
  };

  return (
    <>
      <Dialog
        open={methodOpen}
        onOpenChange={(o) => {
          setMethodOpen(o);
          if (!o && !checkoutOpen) onClose();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>¿Cómo quieres pagar la clase?</DialogTitle>
            <DialogDescription>
              20 € · Guardamos tu plaza 30 minutos mientras completas el pago.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Button
              variant="outline"
              size="lg"
              className="h-auto justify-start gap-3 py-4 text-left"
              disabled={cashLoading}
              onClick={() => void handleDropInCash()}
            >
              <Banknote className="h-5 w-5 shrink-0" />
              <span className="flex flex-col">
                <span className="font-medium">Efectivo</span>
                <span className="text-sm text-muted-foreground">
                  Reserva tu plaza y paga en el estudio
                </span>
              </span>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-auto justify-start gap-3 py-4 text-left"
              disabled={cashLoading}
              onClick={() => {
                setDropInMethod("card");
                setMethodOpen(false);
                setCheckoutOpen(true);
              }}
            >
              <CreditCard className="h-5 w-5 shrink-0" />
              <span className="flex flex-col">
                <span className="font-medium">Tarjeta</span>
                <span className="text-sm text-muted-foreground">Paga ahora con tarjeta</span>
              </span>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-auto justify-start gap-3 py-4 text-left"
              disabled={cashLoading}
              onClick={() => {
                setDropInMethod("bizum");
                setMethodOpen(false);
                setCheckoutOpen(true);
              }}
            >
              <Smartphone className="h-5 w-5 shrink-0" />
              <span className="flex flex-col">
                <span className="font-medium">Bizum</span>
                <span className="text-sm text-muted-foreground">Paga ahora con Bizum</span>
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <StripeCheckoutDialog
        open={checkoutOpen}
        onOpenChange={(o) => {
          setCheckoutOpen(o);
          if (!o) onClose();
        }}
        title="Pagar clase"
        fetchClientSecret={async () => {
          if (!bookingId) throw new Error("No booking");
          const returnUrl = `${window.location.origin}/app/pago-exitoso?session_id={CHECKOUT_SESSION_ID}`;
          const { clientSecret } = await createDropInCheckout({
            bookingId,
            returnUrl,
            paymentMethod: dropInMethod,
          });
          return clientSecret;
        }}
        fetchHostedUrl={async () => {
          if (!bookingId) throw new Error("No booking");
          const returnUrl = `${window.location.origin}/app/pago-exitoso?session_id={CHECKOUT_SESSION_ID}`;
          const { url } = await createDropInCheckout({
            bookingId,
            returnUrl,
            paymentMethod: dropInMethod,
            hosted: true,
          });
          return url;
        }}
      />
    </>
  );
}
