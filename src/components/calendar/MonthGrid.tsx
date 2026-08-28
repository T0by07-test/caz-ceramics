import {
  buildMonthGrid,
  capacityDotClass,
  capacityLevel,
  ES_WEEKDAYS_SHORT,
  formatTime,
  teacherColorVar,
} from "@/lib/calendar";
import type { ClassWithCount } from "@/hooks/useMonthClasses";

type Props = {
  reference: Date;
  classes: ClassWithCount[];
  onSelectClass: (c: ClassWithCount) => void;
  selectedIds?: Set<string>;
};

export function MonthGrid({ reference, classes, onSelectClass, selectedIds }: Props) {
  const cells = buildMonthGrid(reference);
  const byDay = new Map<string, ClassWithCount[]>();
  for (const c of classes) {
    const arr = byDay.get(c.date) ?? [];
    arr.push(c);
    byDay.set(c.date, arr);
  }

  return (
    <div className="rounded-none border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border">
        {ES_WEEKDAYS_SHORT.map((d) => (
          <div
            key={d}
            className="px-1 py-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-label"
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
                "min-h-[86px] border-b border-r border-border p-1 sm:min-h-[120px] sm:p-1.5",
                cell.inMonth ? "bg-surface" : "bg-background/60",
                (idx + 1) % 7 === 0 ? "border-r-0" : "",
              ].join(" ")}
            >
              <div className="mb-1 flex items-center justify-center sm:justify-start sm:px-1">
                <span
                  className={[
                    "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full text-[11px] font-medium sm:h-6 sm:min-w-[1.5rem] sm:text-xs",
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
              <ul className="flex flex-col gap-1.5">
                {dayClasses.map((c) => {
                  const level = capacityLevel(c.booked_count, c.capacity_max);
                  const cancelled = c.status !== "scheduled";
                  const picked = selectedIds?.has(c.id) ?? false;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onSelectClass(c)}
                        style={
                          cancelled
                            ? undefined
                            : { borderLeft: `3px solid ${teacherColorVar(c.teacher)}` }
                        }
                        className={[
                          "flex w-full flex-col gap-0.5 rounded-md border border-border px-0.5 py-0.5 text-left leading-[1.15] transition-colors sm:px-1.5 sm:py-1",
                          cancelled
                            ? "bg-muted text-muted-foreground line-through"
                            : picked
                              ? "border-primary bg-primary/10 text-foreground"
                              : level === "full"
                                ? "border-destructive/40 bg-destructive/10 text-foreground"
                                : "bg-background hover:bg-accent hover:text-foreground",
                        ].join(" ")}
                      >
                        <span className="flex w-full items-center gap-1">
                          <span
                            className={[
                              "h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2",
                              cancelled ? "bg-muted-foreground" : capacityDotClass(level),
                            ].join(" ")}
                            aria-hidden
                          />
                          <span className="text-[9px] font-normal tabular-nums sm:text-xs">
                            {formatTime(c.start_time)}
                          </span>
                          <span className="ml-auto hidden shrink-0 tabular-nums text-xs text-muted-foreground sm:inline">
                            {c.booked_count}/{c.capacity_max}
                          </span>
                        </span>
                        {!cancelled && level === "full" ? (
                          <span className="block text-[8px] font-medium text-destructive sm:pl-3 sm:text-[11px]">
                            completa
                          </span>
                        ) : null}
                        {c.audience === "kids" ? (
                          <span className="block text-[8px] text-muted-foreground sm:pl-3 sm:text-[11px]">
                            niños
                          </span>
                        ) : null}
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
