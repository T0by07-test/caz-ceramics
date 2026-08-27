import { AgendaList } from "./AgendaList";
import { formatDayTitle } from "@/lib/calendar";
import type { ClassWithCount } from "@/hooks/useMonthClasses";

type Props = {
  reference: Date;
  classes: ClassWithCount[];
  onSelectClass: (c: ClassWithCount) => void;
  selectedIds?: Set<string>;
};

export function DayView({ reference, classes, onSelectClass, selectedIds }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-h2 capitalize">{formatDayTitle(reference)}</h2>
      <AgendaList
        classes={classes}
        onSelectClass={onSelectClass}
        emptyLabel="No hay clases este día."
        selectedIds={selectedIds}
      />
    </div>
  );
}
