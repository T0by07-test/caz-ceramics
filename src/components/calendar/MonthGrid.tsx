import {
  buildMonthGrid,
  capacityDotClass,
  capacityLevel,
  ES_WEEKDAYS_SHORT,
  formatTime,
} from "@/lib/calendar";
import type { ClassWithCount } from "@/hooks/useMonthClasses";

type Props = {
  reference: Date;
  classes: ClassWithCount[];
  onSelectClass: (c: ClassWithCount) => void;
};

export function MonthGrid({ reference, classes, onSelectClass }: Props) {
  const cells = buildMonthGrid(reference);
  const byDay = new Map<string, ClassWithCount[]>();
  for (const c of classes) {
    const arr = byDay.get(c.date) ?? [];
    arr.push(c);
    byDay.set(c.date, arr);
  }

  return (
    <div className="rounded-xl border border-border bg-surface shadow-card">
      <div className="grid grid-cols-7 border-b border-border">
        {ES_WEEKDAYS_SHORT.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-label uppercase"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const dayClasses = byDay.get(cell.iso) ?? [];
          return (
            <div
              key={cell.iso + idx}
              className={[
                "min-h-[110px] border-b border-r border-border p-1.5 last:border-r-0",
                cell.inMonth ? "bg-surface" : "bg-background/60",
                (idx + 1) % 7 === 0 ? "border-r-0" : "",
              ].join(" ")}
            >
              <div className="mb-1 flex items-center justify-between px-1">
                <span
                  className={[
                    "inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full text-xs font-medium",
                    cell.isToday
                      ? "bg-primary text-primary-foreground"
                      : cell.inMonth
                        ? "text-foreground"
                        : "text-muted-foreground",
                  ].join(" ")}
                >
                  {cell.date.getDate()}
                </span>
              </div>
              <ul className="space-y-1">
                {dayClasses.map((c) => {
                  const level = capacityLevel(c.booked_count, c.capacity_max);
                  const cancelled = c.status !== "scheduled";
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onSelectClass(c)}
                        className={[
                          "flex w-full items-center gap-1.5 rounded-md border border-border px-1.5 py-1 text-left text-xs transition-colors",
                          cancelled
                            ? "bg-muted text-muted-foreground line-through"
                            : "bg-background hover:bg-accent hover:text-foreground",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "h-2 w-2 shrink-0 rounded-full",
                            cancelled ? "bg-muted-foreground" : capacityDotClass(level),
                          ].join(" ")}
                          aria-hidden
                        />
                        <span className="truncate font-medium">
                          {formatTime(c.start_time)}
                        </span>
                        <span className="ml-auto tabular-nums text-muted-foreground">
                          {c.booked_count}/{c.capacity_max}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}