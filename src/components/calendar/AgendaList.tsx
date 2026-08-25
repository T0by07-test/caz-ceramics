import {
  capacityDotClass,
  capacityLabel,
  capacityLevel,
  formatLongDate,
  formatTimeRange,
  teacherShort,
} from "@/lib/calendar";

import type { ClassWithCount } from "@/hooks/useMonthClasses";

type Props = {
  classes: ClassWithCount[];
  onSelectClass: (c: ClassWithCount) => void;
  emptyLabel?: string;
  selectedIds?: Set<string>;
};

export function AgendaList({
  classes,
  onSelectClass,
  emptyLabel = "No hay clases programadas.",
  selectedIds,
}: Props) {
  const grouped = new Map<string, ClassWithCount[]>();
  for (const c of classes) {
    const arr = grouped.get(c.date) ?? [];
    arr.push(c);
    grouped.set(c.date, arr);
  }
  const days = Array.from(grouped.keys()).sort();

  if (days.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground shadow-card">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {days.map((day) => (
        <section key={day}>
          <h3 className="text-label mb-2 capitalize">{formatLongDate(day)}</h3>
          <ul className="space-y-2">
            {(grouped.get(day) ?? []).map((c) => {
              const level = capacityLevel(c.booked_count, c.capacity_max);
              const cancelled = c.status !== "scheduled";
              const picked = selectedIds?.has(c.id) ?? false;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelectClass(c)}
                    className={[
                      "flex w-full items-center gap-3 rounded-xl border p-3 text-left shadow-card transition-colors",
                      picked
                        ? "border-primary bg-primary/10"
                        : "border-border bg-surface hover:bg-accent",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "h-2.5 w-2.5 shrink-0 rounded-full",
                        cancelled ? "bg-muted-foreground" : capacityDotClass(level),
                      ].join(" ")}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">
                        {formatTimeRange(c.start_time, c.end_time)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {cancelled ? "Cancelada" : capacityLabel(level)}
                        {c.teacher ? ` · ${teacherShort(c.teacher)}` : ""}
                        {c.audience === "kids" ? " · Clase infantil" : ""}
                      </div>
                    </div>
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {c.booked_count}/{c.capacity_max}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
