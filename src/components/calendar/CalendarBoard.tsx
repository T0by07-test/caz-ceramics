import { MonthGrid } from "./MonthGrid";
import { MobileWeekList } from "./MobileWeekList";
import { WeekGrid } from "./WeekGrid";
import { DayView } from "./DayView";
import { useIsMobile } from "@/hooks/use-mobile";
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

  // Week view keeps its own horizontal scroll on phones; month view is compact.

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

  if (isMobile) {
    return (
      <MobileWeekList
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
      <div className="grid grid-cols-7 gap-px rounded-none border border-border bg-border p-px">
        {Array.from({ length: 42 }).map((_, i) => (
          <div key={i} className="h-[110px] animate-pulse bg-surface" />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-none border border-border bg-surface" />
      ))}
    </div>
  );
}
