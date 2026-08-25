import { MonthGrid } from "./MonthGrid";
import { WeekGrid } from "./WeekGrid";
import { DayView } from "./DayView";
import { AgendaList } from "./AgendaList";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatMonthTitle, formatWeekTitle } from "@/lib/calendar";
import type { CalendarView } from "@/lib/calendar-view";
import type { ClassWithCount } from "@/hooks/useMonthClasses";

type Props = {
  view: CalendarView;
  reference: Date;
  classes: ClassWithCount[];
  loading: boolean;
  onSelectClass: (c: ClassWithCount) => void;
  selectedIds?: Set<string>;
};

export function CalendarBoard({
  view,
  reference,
  classes,
  loading,
  onSelectClass,
  selectedIds,
}: Props) {
  const isMobile = useIsMobile();

  if (loading) return <BoardSkeleton view={isMobile ? "day" : view} />;

  if (view === "day") {
    return (
      <DayView
        reference={reference}
        classes={classes}
        onSelectClass={onSelectClass}
        selectedIds={selectedIds}
      />
    );
  }

  // On phones a 7-column grid clips the class info, so show a full agenda list
  // of the visible range instead — every class with time, teacher and capacity.
  if (isMobile) {
    const inRange =
      view === "month"
        ? classes.filter((c) => {
            const [y, m] = c.date.split("-").map(Number);
            return m - 1 === reference.getMonth() && y === reference.getFullYear();
          })
        : classes;
    return (
      <div className="space-y-3">
        <h2 className="text-h2 capitalize">
          {view === "month" ? formatMonthTitle(reference) : formatWeekTitle(reference)}
        </h2>
        <AgendaList
          classes={inRange}
          onSelectClass={onSelectClass}
          emptyLabel={
            view === "month"
              ? "No hay clases programadas este mes."
              : "No hay clases esta semana."
          }
          selectedIds={selectedIds}
        />
      </div>
    );
  }

  if (view === "week") {
    return (
      <WeekGrid
        reference={reference}
        classes={classes}
        onSelectClass={onSelectClass}
        selectedIds={selectedIds}
      />
    );
  }

  return (
    <MonthGrid
      reference={reference}
      classes={classes}
      onSelectClass={onSelectClass}
      selectedIds={selectedIds}
    />
  );
}

function BoardSkeleton({ view }: { view: CalendarView }) {
  if (view === "month") {
    return (
      <div className="grid grid-cols-7 gap-px rounded-xl border border-border bg-border p-px shadow-card">
        {Array.from({ length: 42 }).map((_, i) => (
          <div key={i} className="h-[110px] animate-pulse bg-surface" />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-surface" />
      ))}
    </div>
  );
}
