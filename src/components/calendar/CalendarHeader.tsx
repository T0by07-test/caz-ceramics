import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { viewTitle, type CalendarView } from "@/lib/calendar-view";

type Props = {
  view: CalendarView;
  reference: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (v: CalendarView) => void;
  rightSlot?: React.ReactNode;
};

export function CalendarHeader({
  view,
  reference,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  rightSlot,
}: Props) {
  const title = viewTitle(view, reference);
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        <Button type="button" variant="outline" size="icon" onClick={onPrev} aria-label="Anterior" className="shrink-0">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-h2 min-w-0 flex-1 truncate text-center capitalize lg:min-w-[14ch] lg:flex-none lg:text-left">{title}</h2>
        <Button type="button" variant="outline" size="icon" onClick={onNext} aria-label="Siguiente" className="shrink-0">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onToday} className="ml-1 shrink-0">
          Hoy
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && onViewChange(v as CalendarView)}
        >
          <ToggleGroupItem value="month" aria-label="Vista mensual">
            Mes
          </ToggleGroupItem>
          <ToggleGroupItem value="week" aria-label="Vista semanal">
            Semana
          </ToggleGroupItem>
          <ToggleGroupItem value="day" aria-label="Vista diaria">
            Día
          </ToggleGroupItem>
        </ToggleGroup>
        {rightSlot ? <div className="flex items-center gap-2">{rightSlot}</div> : null}
      </div>
    </div>
  );
}
