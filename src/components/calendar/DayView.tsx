import { AgendaList } from "./AgendaList";
import { formatDayTitle } from "@/lib/calendar";
import type { ClassWithCount } from "@/hooks/useMonthClasses";

type Props = {
  reference: Date;
  classes: ClassWithCount[];
  onSelectClass: (c: ClassWithCount) => void;
};

export function DayView({ reference, classes, onSelectClass }: Props) {
  return (
    <div className="space-y-3">
      <h2 className="text-h2 capitalize">{formatDayTitle(reference)}</h2>
      <AgendaList classes={classes} onSelectClass={onSelectClass} emptyLabel="No hay clases este día." />
    </div>
  );
}
