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
  const weekdayCells = cells.filter((cell) => {
    const day = cell.date.getDay();
    return day !== 0 && day !== 6;
  });
  const byDay = new Map<string, ClassWithCount[]>();
  for (const c of classes) {
    const arr = byDay.get(c.date) ?? [];
    arr.push(c);
    byDay.set(c.date, arr);
  }

  return (
    <div className="overflow-hidden rounded-none border border-border bg-surface">
      <div className="grid grid-cols-5 border-b border-border sm:grid-cols-7">
        {ES_WEEKDAYS_SHORT.map((d, index) => (
          <div
            key={d}
            className={[
              "px-1 py-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-label",
              index > 4 ? "hidden sm:block" : "",
            ].join(" ")}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 sm:grid-cols-7">
        <MobileCells
          cells={weekdayCells}
          byDay={byDay}
          onSelectClass={onSelectClass}
          selectedIds={selectedIds}
        />
        <DesktopCells
          cells={cells}
          byDay={byDay}
          onSelectClass={onSelectClass}
          selectedIds={selectedIds}
        />
      </div>
    </div>
  );
}

type CellsProps = {
  cells: ReturnType<typeof buildMonthGrid>;
  byDay: Map<string, ClassWithCount[]>;
  onSelectClass: (c: ClassWithCount) => void;
  selectedIds?: Set<string>;
};

function MobileCells({ cells, byDay, onSelectClass, selectedIds }: CellsProps) {
  return (
    <>
      {cells.map((cell, idx) => {
        const dayClasses = byDay.get(cell.iso) ?? [];
        return (
          <div
            key={cell.iso + idx}
            className={[
              "min-h-[92px] min-w-0 border-b border-r border-border p-0.5 sm:hidden",
              cell.inMonth ? "bg-surface" : "bg-background/60",
              (idx + 1) % 5 === 0 ? "border-r-0" : "",
            ].join(" ")}
          >
            <DayNumber cell={cell} />
            <ul className="flex min-w-0 flex-col gap-0.5">
              {dayClasses.map((c) => {
                const level = capacityLevel(c.booked_count, c.capacity_max);
                const cancelled = c.status !== "scheduled";
                const picked = selectedIds?.has(c.id) ?? false;
                const remaining = Math.max(c.capacity_max - c.booked_count, 0);
                return (
                  <li key={c.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onSelectClass(c)}
                      style={cancelled ? undefined : { borderLeft: `3px solid ${teacherColorVar(c.teacher)}` }}
                      className={[
                        "flex w-full min-w-0 flex-col rounded-sm border border-border px-1 py-1 text-left leading-tight transition-colors",
                        cancelled
                          ? "bg-muted text-muted-foreground line-through"
                          : picked
                            ? "border-primary bg-primary/10 text-foreground"
                            : level === "full"
                              ? "border-destructive/40 bg-destructive/10 text-foreground"
                              : "bg-background text-foreground",
                      ].join(" ")}
                    >
                      <span className="truncate text-[10px] font-semibold tabular-nums">
                        {formatTime(c.start_time)}
                      </span>
                      <span className="truncate text-[9px] text-muted-foreground">
                        {c.teacher ?? "Sin profe"}
                      </span>
                      <span
                        className={[
                          "truncate text-[9px] font-medium tabular-nums",
                          cancelled || level === "full" ? "text-destructive" : "text-muted-foreground",
                        ].join(" ")}
                      >
                        {cancelled ? "Cancelada" : level === "full" ? "Completa" : `${remaining} libres`}
                      </span>
                      {c.audience === "kids" ? (
                        <span className="truncate text-[9px] text-muted-foreground">Niños</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function DesktopCells({ cells, byDay, onSelectClass, selectedIds }: CellsProps) {
  return (
    <>
      {cells.map((cell, idx) => {
          const dayClasses = byDay.get(cell.iso) ?? [];
          return (
            <div
              key={cell.iso + idx}
              className={[
                "hidden min-h-[120px] border-b border-r border-border p-1.5 sm:block",
                cell.inMonth ? "bg-surface" : "bg-background/60",
                (idx + 1) % 7 === 0 ? "border-r-0" : "",
              ].join(" ")}
            >
              <DayNumber cell={cell} desktop />
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
                          "flex w-full flex-col gap-0.5 rounded-md border border-border px-1.5 py-1 text-left leading-[1.15] transition-colors",
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
                              "h-2 w-2 shrink-0 rounded-full",
                              cancelled ? "bg-muted-foreground" : capacityDotClass(level),
                            ].join(" ")}
                            aria-hidden
                          />
                          <span className="text-xs font-normal tabular-nums">
                            {formatTime(c.start_time)}
                          </span>
                          <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                            {c.booked_count}/{c.capacity_max}
                          </span>

                        </span>
                        {!cancelled && level === "full" ? (
                           <span className="block pl-3 text-[11px] font-medium text-destructive">
                            completa
                          </span>
                        ) : null}
                        {c.audience === "kids" ? (
                           <span className="block pl-3 text-[11px] text-muted-foreground">
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
    </>
  );
}

function DayNumber({ cell, desktop = false }: { cell: ReturnType<typeof buildMonthGrid>[number]; desktop?: boolean }) {
  return (
    <div className={desktop ? "mb-1 flex items-center justify-start px-1" : "mb-0.5 flex items-center justify-center"}>
      <span
        className={[
          "inline-flex items-center justify-center rounded-full font-medium",
          desktop ? "h-6 min-w-[1.5rem] text-xs" : "h-5 min-w-5 text-[10px]",
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
  );
}
