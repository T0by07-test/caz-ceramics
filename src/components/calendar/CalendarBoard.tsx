import { MonthGrid } from "./MonthGrid";
import { MobileWeekList } from "./MobileWeekList";
import { WeekGrid } from "./WeekGrid";
import { DayView } from "./DayView";
import { AgendaList } from "./AgendaList";
import type { CalendarView } from "@/lib/calendar-view";
import type { ClassWithCount } from "@/hooks/useMonthClasses";

type Props = {
  view: CalendarView;
  reference: Date;
  classes: ClassWithCount[];
  loading: boolean;
  onSelectClass: (c: ClassWithCount) => void;
};

export function CalendarBoard({ view, reference, classes, loading, onSelectClass }: Props) {
  if (loading) return <BoardSkeleton view={view} />;

  if (view === "day") {
    return <DayView reference={reference} classes={classes} onSelectClass={onSelectClass} />;
  }

  if (view === "week") {
    return (
      <>
        <div className="lg:hidden">
          <AgendaList
            classes={classes}
            onSelectClass={onSelectClass}
            emptyLabel="No hay clases esta semana."
          />
        </div>
        <div className="hidden lg:block">
          <WeekGrid reference={reference} classes={classes} onSelectClass={onSelectClass} />
        </div>
      </>
    );
  }

  // month
  return (
    <>
      <div className="lg:hidden">
        <MobileWeekList reference={reference} classes={classes} onSelectClass={onSelectClass} />
      </div>
      <div className="hidden lg:block">
        <MonthGrid reference={reference} classes={classes} onSelectClass={onSelectClass} />
      </div>
    </>
  );
}

function BoardSkeleton({ view }: { view: CalendarView }) {
  if (view === "month") {
    return (
      <>
        <div className="space-y-2 lg:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-surface" />
          ))}
        </div>
        <div className="hidden grid-cols-7 gap-px rounded-xl border border-border bg-border p-px shadow-card lg:grid">
          {Array.from({ length: 42 }).map((_, i) => (
            <div key={i} className="h-[110px] animate-pulse bg-surface" />
          ))}
        </div>
      </>
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
