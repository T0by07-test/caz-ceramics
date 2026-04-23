import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { addMonths } from "@/lib/calendar";
import {
  capacityDotClass,
  capacityLabel,
  capacityLevel,
  formatLongDate,
  formatTimeRange,
} from "@/lib/calendar";
import { useMonthClasses, type ClassWithCount } from "@/hooks/useMonthClasses";
import { useMyPlan } from "@/hooks/useMyPlan";
import { bookClass } from "@/lib/booking";
import { MonthHeader } from "@/components/calendar/MonthHeader";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { MobileWeekList } from "@/components/calendar/MobileWeekList";

export const Route = createFileRoute("/app/")({
  component: CalendarioPage,
});

function CalendarioPage() {
  const [reference, setReference] = useState(() => new Date());
  const [selected, setSelected] = useState<ClassWithCount | null>(null);
  const { classes, loading, refresh } = useMonthClasses(reference, "student");

  return (
    <div className="space-y-6">
      <div>
        <span className="text-label uppercase">Tu mes</span>
        <h1 className="text-h1 mt-1">Calendario</h1>
        <p className="text-body mt-2 text-muted-foreground">
          Clases del mes — toca una clase para ver los detalles.
        </p>
      </div>

      <MonthHeader
        reference={reference}
        onPrev={() => setReference((d) => addMonths(d, -1))}
        onNext={() => setReference((d) => addMonths(d, 1))}
        onToday={() => setReference(new Date())}
        rightSlot={
          <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
            <Legend />
          </div>
        }
      />

      {/* Mobile: weekly/monthly list */}
      <div className="lg:hidden">
        {loading ? (
          <ListSkeleton />
        ) : (
          <MobileWeekList
            reference={reference}
            classes={classes}
            onSelectClass={setSelected}
          />
        )}
      </div>

      {/* Desktop: month grid */}
      <div className="hidden lg:block">
        {loading ? (
          <GridSkeleton />
        ) : (
          <MonthGrid reference={reference} classes={classes} onSelectClass={setSelected} />
        )}
      </div>

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

function GridSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-px rounded-xl border border-border bg-border p-px shadow-card">
      {Array.from({ length: 42 }).map((_, i) => (
        <div key={i} className="h-[110px] animate-pulse bg-surface" />
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-surface" />
      ))}
    </div>
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
  // Look up the credits for the class's month (not necessarily the visible month).
  const planMonth = cls ? new Date(...cls.date.split("-").map(Number).map((n, i) => i === 1 ? n - 1 : n) as [number, number, number]) : undefined;
  const { creditsRemaining } = useMyPlan(planMonth);
  const [submitting, setSubmitting] = useState(false);

  const isFull = cls ? cls.booked_count >= cls.capacity_max : true;
  const usePlan = (creditsRemaining ?? 0) > 0;

  const handleBook = async () => {
    if (!cls) return;
    setSubmitting(true);
    try {
      await bookClass(cls.id, usePlan ? "plan" : "drop_in");
      toast.success("Clase reservada");
      onBooked();
    } catch (err) {
      toast.error("No se pudo reservar", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
            <Button
              className="w-full"
              size="lg"
              onClick={handleBook}
              disabled={submitting || isFull}
            >
              {submitting
                ? "Reservando…"
                : isFull
                  ? "Clase completa"
                  : usePlan
                    ? `Reservar con mi plan (${creditsRemaining} restantes)`
                    : "Reservar clase suelta"}
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
