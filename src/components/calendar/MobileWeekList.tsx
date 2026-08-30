import {
  capacityDotClass,
  capacityLevel,
  formatLongDate,
  formatTimeRange,
} from "@/lib/calendar";
import type { ClassWithCount } from "@/hooks/useMonthClasses";

type Props = {
  reference: Date;
  classes: ClassWithCount[];
  onSelectClass: (c: ClassWithCount) => void;
  selectedIds?: Set<string>;
};

export function MobileWeekList({ reference, classes, onSelectClass, selectedIds }: Props) {
  // Show all classes within the visible month (matches month grid range).
  const monthOnly = classes.filter((c) => {
    const [, m] = c.date.split("-").map(Number);
    return m - 1 === reference.getMonth();
  });

  const grouped = new Map<string, ClassWithCount[]>();
  for (const c of monthOnly) {
    const arr = grouped.get(c.date) ?? [];
    arr.push(c);
    grouped.set(c.date, arr);
  }
  const days = Array.from(grouped.keys()).sort();

  if (days.length === 0) {
    return (
      <div className="rounded-none border border-border bg-surface p-6 text-center text-sm text-muted-foreground">
        No hay clases programadas este mes.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <section key={day}>
          <h3 className="text-label mb-2 capitalize">{formatLongDate(day)}</h3>
          <ul className="flex flex-col gap-2">
            {(grouped.get(day) ?? []).map((c) => {
              const level = capacityLevel(c.booked_count, c.capacity_max);
              const cancelled = c.status !== "scheduled";
              const picked = selectedIds?.has(c.id) ?? false;
              const remaining = Math.max(c.capacity_max - c.booked_count, 0);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelectClass(c)}
                    className={[
                      "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border p-3 text-left transition-colors",
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
                    <div className="min-w-0">
                      <div className="text-sm font-medium tabular-nums text-foreground">
                        {formatTimeRange(c.start_time, c.end_time)}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {c.teacher ? `Profe ${c.teacher}` : "Sin profesora"}
                        {c.audience === "kids" ? " · Infantil" : " · Adultos"}
                      </div>
                    </div>
                    <div className="min-w-[5.75rem] text-right">
                      <div
                        className={[
                          "text-xs font-medium tabular-nums",
                          cancelled || level === "full" ? "text-destructive" : "text-foreground",
                        ].join(" ")}
                      >
                        {cancelled
                          ? "Cancelada"
                          : level === "full"
                            ? "Completa"
                            : `${remaining} ${remaining === 1 ? "plaza libre" : "plazas libres"}`}
                      </div>
                      {!cancelled ? (
                        <div className="text-[11px] tabular-nums text-muted-foreground">
                          {c.booked_count}/{c.capacity_max} reservadas
                        </div>
                      ) : null}
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
