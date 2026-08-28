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
    <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:gap-3 lg:justify-between lg:overflow-visible lg:pb-0">
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onPrev}
          aria-label="Anterior"
          className="h-8 w-8 shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="shrink-0 whitespace-nowrap font-display text-[18px] font-extralight capitalize leading-[1.2] tracking-[0.02em] text-foreground sm:text-[26px] lg:min-w-[14ch] lg:text-left">
          {title}
        </h2>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onNext}
          aria-label="Siguiente"
          className="h-8 w-8 shrink-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToday}
          className="ml-1 hidden shrink-0 sm:inline-flex"
        >
          Hoy
        </Button>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          value={view}
          onValueChange={(v) => v && onViewChange(v as CalendarView)}
          className="gap-0.5"
        >
          <ToggleGroupItem value="month" aria-label="Vista mensual" className="px-0.5 sm:px-2">
            Mes
          </ToggleGroupItem>
          <ToggleGroupItem value="week" aria-label="Vista semanal" className="px-0.5 sm:px-2">
            Semana
          </ToggleGroupItem>
          <ToggleGroupItem value="day" aria-label="Vista diaria" className="px-0.5 sm:px-2">
            Día
          </ToggleGroupItem>
        </ToggleGroup>
        {rightSlot ? <div className="flex items-center gap-2">{rightSlot}</div> : null}
      </div>
    </div>
  );
}
