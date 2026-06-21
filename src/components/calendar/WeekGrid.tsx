import {
  buildWeekDays,
  capacityDotClass,
  capacityLevel,
  dayHourBounds,
  ES_WEEKDAYS_SHORT,
  formatTime,
} from "@/lib/calendar";
import type { ClassWithCount } from "@/hooks/useMonthClasses";

type Props = {
  reference: Date;
  classes: ClassWithCount[];
  onSelectClass: (c: ClassWithCount) => void;
};

export function WeekGrid({ reference, classes, onSelectClass }: Props) {
  const days = buildWeekDays(reference);
  const [minH, maxH] = dayHourBounds(classes.map((c) => c.start_time));
  const hours: number[] = [];
  for (let h = minH; h <= maxH; h++) hours.push(h);

  const byDay = new Map<string, ClassWithCount[]>();
  for (const c of classes) {
    const arr = byDay.get(c.date) ?? [];
    arr.push(c);
    byDay.set(c.date, arr);
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
      <div className="min-w-[760px]">
        {/* Header: time gutter + 7 day columns */}
        <div className="grid grid-cols-8 border-b border-border">
          <div className="px-2 py-2" />
          {days.map((d, i) => (
            <div key={d.iso} className="px-2 py-2 text-center">
              <div className="text-label uppercase">{ES_WEEKDAYS_SHORT[i]}</div>
              <span
                className={[
                  "mx-auto mt-1 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full text-xs font-medium",
                  d.isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                ].join(" ")}
              >
                {d.date.getDate()}
              </span>
            </div>
          ))}
        </div>

        {/* One row per hour */}
        {hours.map((h) => (
          <div key={h} className="grid grid-cols-8 border-b border-border last:border-b-0">
            <div className="px-2 py-2 text-right text-xs tabular-nums text-muted-foreground">
              {String(h).padStart(2, "0")}:00
            </div>
            {days.map((d) => {
              const cellClasses = (byDay.get(d.iso) ?? []).filter(
                (c) => Number(c.start_time.slice(0, 2)) === h,
              );
              return (
                <div key={d.iso + h} className="min-h-[48px] space-y-1 border-l border-border p-1">
                  {cellClasses.map((c) => {
                    const level = capacityLevel(c.booked_count, c.capacity_max);
                    const cancelled = c.status !== "scheduled";
                    return (
                      <button
                        key={c.id}
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
                        <span className="truncate font-medium">{formatTime(c.start_time)}</span>
                        <span className="ml-auto tabular-nums text-muted-foreground">
                          {c.booked_count}/{c.capacity_max}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
