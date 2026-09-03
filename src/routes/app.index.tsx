import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { BadgeCheck, Banknote, CreditCard, X } from "lucide-react";
import {
  
  capacityDotClass,
  capacityLabel,
  capacityLevel,
  formatLongDate,
  formatTimeRange,
  toIsoDate,
} from "@/lib/calendar";
import { useClassesInRange, type ClassWithCount } from "@/hooks/useClassesInRange";
import { useMyBookedClassIds } from "@/hooks/useMyBookedClassIds";
import { useMyPlan } from "@/hooks/useMyPlan";
import { bookClass } from "@/lib/booking";
import { formatEuros, selectionPriceCents } from "@/lib/pricing";
import { studioClosureFor } from "@/lib/closures";
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
  // An unparameterised visit lands on the current month (September at launch);
  // ?date= (and "Hoy") still win.
  const reference = useMemo(
    () => (search.date ? parseReference(search.date) : new Date()),
    [search.date],
  );
  const range = useMemo(() => rangeForView(view, reference), [view, reference]);

  const [full, setFull] = useState<ClassWithCount | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [pendingPaymentClasses, setPendingPaymentClasses] = useState<ClassWithCount[]>([]);
  const { classes, loading, refresh } = useClassesInRange(range, "student");
  const { bookedClassIds, refresh: refreshMyBookings } = useMyBookedClassIds();

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
    const closure = studioClosureFor(c.date);
    if (closure) {
      toast.error("Esa semana el estudio está cerrado", { description: closure.label });
      return;
    }
    if (bookedClassIds.has(c.id)) {
      toast.info("Ya tienes esta clase reservada", {
        description: "Puedes verla en «Mis reservas».",
      });
      return;
    }
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
    setSubmitting(true);
    const ordered = [...selectedClasses].sort((a, b) =>
      `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`),
    );

    setSubmitting(false);
    setSelectedIds(new Set());
    setPendingPaymentClasses(ordered);
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div>
        <h1 className="text-h1">Calendario</h1>
        <p className="text-body mt-2 hidden text-muted-foreground sm:block">
          Toca las clases a las que quieras venir y elige cómo pagar para reservar.
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
          submitting={submitting}
          onClear={() => setSelectedIds(new Set())}
          onConfirm={() => void handleConfirm()}
        />
      ) : null}

      <WaitlistSheet cls={full} onOpenChange={(open) => !open && setFull(null)} />

      <DropInPaymentFlow
        classes={pendingPaymentClasses}
        onClose={() => {
          setPendingPaymentClasses([]);
          void refresh();
          void refreshMyBookings();
        }}
      />
    </div>
  );
}

function SelectionBar({
  classes,
  submitting,
  onClear,
  onConfirm,
}: {
  classes: ClassWithCount[];
  submitting: boolean;
  onClear: () => void;
  onConfirm: () => void;
}) {
  const count = classes.length;
  const totalLabel = formatEuros(selectionPriceCents(classes));
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] text-foreground">
              {count === 1 ? "1 clase seleccionada" : `${count} clases seleccionadas`}
              {` · ${totalLabel}`}
            </div>
            <div className="truncate text-sm text-muted-foreground">
              {classes
                .map(
                  (c) => `${formatLongDate(c.date)} · ${formatTimeRange(c.start_time, c.end_time)}`,
                )
                .join(" · ")}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Quitar selección"
            onClick={onClear}
            className="-mr-2 shrink-0 sm:mr-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Button
          onClick={onConfirm}
          disabled={submitting}
          className="w-full shrink-0 px-6 py-3 sm:w-auto sm:px-8 sm:py-4"
        >
          {submitting ? "Preparando…" : `Elegir pago · ${totalLabel}`}
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
          <div className="flex flex-col mt-6 gap-6 px-4">
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
  classes,
  onClose,
}: {
  classes: ClassWithCount[];
  onClose: () => void;
}) {
  const [methodOpen, setMethodOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [bookingIds, setBookingIds] = useState<string[]>([]);
  const [reservedClasses, setReservedClasses] = useState<ClassWithCount[]>([]);
  const [reserving, setReserving] = useState(false);
  const [cashLoading, setCashLoading] = useState(false);
  const [cashDoneOpen, setCashDoneOpen] = useState(false);
  const [cashDoneTotal, setCashDoneTotal] = useState("");
  const [planLoading, setPlanLoading] = useState(false);

  const count = classes.length;
  const paidClasses = reservedClasses.length > 0 ? reservedClasses : classes;
  const totalLabel = formatEuros(selectionPriceCents(paidClasses));

  // Plan credits only make sense when every selected class falls in the same
  // month (a plan is scoped to one month); mixed-month selections just fall
  // through to the regular cash/card flow below.
  const monthKeys = useMemo(() => new Set(classes.map((c) => c.date.slice(0, 7))), [classes]);
  const singleMonth = monthKeys.size === 1 ? classes[0]?.date : null;
  const monthDate = useMemo(
    () => (singleMonth ? new Date(`${singleMonth}-01T00:00:00`) : undefined),
    [singleMonth],
  );
  const { hasPlan, remaining, planName } = useMyPlan(monthDate);
  const canUsePlan = Boolean(singleMonth) && hasPlan && count > 0 && remaining >= count;

  useEffect(() => {
    if (count > 0) setMethodOpen(true);
  }, [count]);

  useEffect(() => {
    if (count === 0) {
      setBookingIds([]);
      setReservedClasses([]);
      setReserving(false);
      setCashLoading(false);
    }
  }, [count]);

  const reserveBookings = useCallback(async () => {
    if (bookingIds.length > 0) return bookingIds;
    if (classes.length === 0) throw new Error("No hay clases seleccionadas.");

    setReserving(true);
    const ordered = [...classes].sort((a, b) =>
      `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`),
    );
    const createdIds: string[] = [];
    const createdClasses: ClassWithCount[] = [];
    const failed: string[] = [];

    for (const c of ordered) {
      try {
        const res = await bookClass(c.id, "drop_in");
        createdIds.push(res.booking_id);
        createdClasses.push(c);
      } catch (err) {
        failed.push(
          `${formatLongDate(c.date)} · ${formatTimeRange(c.start_time, c.end_time)}${
            err instanceof Error ? ` — ${err.message}` : ""
          }`,
        );
      }
    }

    setBookingIds(createdIds);
    setReservedClasses(createdClasses);
    setReserving(false);

    if (failed.length > 0) {
      toast.error(
        createdIds.length > 0 ? "Algunas clases no se pudieron preparar" : "No se pudo reservar",
        { description: failed.join(" | ") },
      );
    }
    if (createdIds.length === 0) throw new Error("No se pudo preparar ninguna reserva.");
    return createdIds;
  }, [bookingIds, classes]);

  const handlePlanBooking = async () => {
    if (count === 0) return;
    setPlanLoading(true);
    const ordered = [...classes].sort((a, b) =>
      `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`),
    );
    const createdIds: string[] = [];
    const failed: string[] = [];
    for (const c of ordered) {
      try {
        await bookClass(c.id, "plan");
        createdIds.push(c.id);
      } catch (err) {
        failed.push(
          `${formatLongDate(c.date)} · ${formatTimeRange(c.start_time, c.end_time)}${
            err instanceof Error ? ` — ${err.message}` : ""
          }`,
        );
      }
    }
    setPlanLoading(false);
    if (failed.length > 0) {
      toast.error(
        createdIds.length > 0 ? "Algunas clases no se pudieron reservar" : "No se pudo reservar",
        { description: failed.join(" | ") },
      );
    }
    if (createdIds.length === 0) return;
    setMethodOpen(false);
    toast.success(
      createdIds.length === 1 ? "Plaza reservada con tu plan" : "Plazas reservadas con tu plan",
    );
    onClose();
  };

  const handleDropInCash = async () => {
    if (count === 0) return;
    setCashLoading(true);
    let ids: string[];
    try {
      ids = await reserveBookings();
    } catch (err) {
      setCashLoading(false);
      toast.error("No se pudo reservar tu plaza", {
        description: err instanceof Error ? err.message : undefined,
      });
      return;
    }
    const { error } = await (
      supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>
    )("pay_drop_in_cash_batch", {
      p_booking_ids: ids,
    });
    setCashLoading(false);
    if (error) {
      toast.error("No se pudo reservar tu plaza", { description: error.message });
      return;
    }
    setMethodOpen(false);
    setCashDoneTotal(totalLabel);
    setCashDoneOpen(true);
    toast.success(count === 1 ? "Plaza reservada" : "Plazas reservadas");
  };

  const fetchClientSecret = useCallback(async () => {
    const ids = await reserveBookings();
    const returnUrl = `${window.location.origin}/app/pago-exitoso?session_id={CHECKOUT_SESSION_ID}`;
    const { clientSecret } = await createDropInCheckout({
      bookingIds: ids,
      returnUrl,
      paymentMethod: "card",
    });
    return clientSecret;
  }, [reserveBookings]);

  const fetchHostedUrl = useCallback(async () => {
    const ids = await reserveBookings();
    const returnUrl = `${window.location.origin}/app/pago-exitoso?session_id={CHECKOUT_SESSION_ID}`;
    const { url } = await createDropInCheckout({
      bookingIds: ids,
      returnUrl,
      paymentMethod: "card",
      hosted: true,
    });
    return url;
  }, [reserveBookings]);

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
            <DialogTitle>
              ¿Cómo quieres pagar {count === 1 ? "la clase" : `las ${count} clases`}?
            </DialogTitle>
            <DialogDescription>
              {totalLabel} · Guardamos tu plaza 30 minutos mientras completas el pago.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {canUsePlan ? (
              <Button
                variant="outline"
                size="lg"
                className="h-auto items-start justify-start gap-3 whitespace-normal border-primary py-4 text-left"
                disabled={cashLoading || reserving || planLoading}
                onClick={() => void handlePlanBooking()}
              >
                <BadgeCheck className="h-5 w-5 shrink-0 text-primary" />
                <span className="flex flex-col">
                  <span className="font-medium">
                    Usar mi plan{planName ? ` · ${planName}` : ""}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Incluida en tu plan · te queda{remaining === 1 ? "" : "n"} {remaining} clase
                    {remaining === 1 ? "" : "s"} este mes
                  </span>
                </span>
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="lg"
              className="h-auto items-start justify-start gap-3 whitespace-normal py-4 text-left"
              disabled={cashLoading || reserving || planLoading}
              onClick={() => void handleDropInCash()}
            >
              <Banknote className="h-5 w-5 shrink-0" />
              <span className="flex flex-col">
                <span className="font-medium">Efectivo</span>
                <span className="text-sm text-muted-foreground">
                  Elige efectivo y la plaza queda reservada para pagar en el estudio
                </span>
              </span>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-auto items-start justify-start gap-3 whitespace-normal py-4 text-left"
              disabled={cashLoading || reserving || planLoading}
              onClick={() => {
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
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={cashDoneOpen}
        onOpenChange={(o) => {
          setCashDoneOpen(o);
          if (!o) onClose();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {count === 1 ? "Plaza reservada" : "Plazas reservadas"} · {cashDoneTotal}
            </DialogTitle>
            <DialogDescription>
              Si has elegido pagar tus clases en efectivo, puedes realizar el pago directamente en
              el taller el primer día de clase del mes al que corresponden tus clases.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            No necesitas realizar ningún pago por adelantado para reservar tu plaza. Te hemos
            enviado un correo con la confirmación de tus clases.
          </p>
          <Button
            className="w-full"
            onClick={() => {
              setCashDoneOpen(false);
              onClose();
            }}
          >
            Entendido
          </Button>
        </DialogContent>
      </Dialog>

      <StripeCheckoutDialog
        open={checkoutOpen}
        onOpenChange={(o) => {
          setCheckoutOpen(o);
          if (!o) onClose();
        }}
        title={count === 1 ? "Pagar clase" : `Pagar ${count} clases`}
        fetchClientSecret={fetchClientSecret}
        fetchHostedUrl={fetchHostedUrl}
      />
    </>
  );
}
