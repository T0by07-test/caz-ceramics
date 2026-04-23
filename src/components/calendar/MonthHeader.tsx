import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonthTitle } from "@/lib/calendar";

type Props = {
  reference: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  rightSlot?: React.ReactNode;
};

export function MonthHeader({ reference, onPrev, onNext, onToday, rightSlot }: Props) {
  const title = formatMonthTitle(reference);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onPrev}
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-h2 min-w-[12ch] text-center capitalize sm:text-left">{title}</h2>
        <Button type="button" variant="outline" size="icon" onClick={onNext} aria-label="Mes siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onToday} className="ml-1">
          Hoy
        </Button>
      </div>
      {rightSlot ? <div className="flex items-center gap-2">{rightSlot}</div> : null}
    </div>
  );
}