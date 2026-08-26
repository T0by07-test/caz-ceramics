import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ES_WEEKDAYS_SHORT,
  addMonths,
  buildMonthGrid,
  formatLongDate,
  formatMonthTitle,
  formatTime,
  formatTimeRange,
  teacherShort,
  toIsoDate,
} from "@/lib/calendar";


export type UpcomingClass = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  audience: "adults" | "kids";
  teacher?: string | null;
};

/** Public month calendar to pick class slots (used on /solicitar and in the info dialog). */
export function PublicClassCalendar({
  monthRef,
  onMonthChange,
  byDate,
  loading,
  selectedIds,
  selectedDay,
  onSelectDay,
  onToggle,
}: {
  monthRef: Date;
  onMonthChange: (d: Date) => void;
  byDate: Map<string, UpcomingClass[]>;
  loading: boolean;
  selectedIds: Set<string>;
  selectedDay: string | null;
  onSelectDay: (iso: string | null) => void;
  onToggle: (id: string) => void;
}) {
  const cells = useMemo(() => buildMonthGrid(monthRef), [monthRef]);
  const todayIso = toIsoDate(new Date());
  const daySlots = selectedDay ? (byDate.get(selectedDay) ?? []) : [];

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Mes anterior"
          onClick={() => onMonthChange(addMonths(monthRef, -1))}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-semibold capitalize">{formatMonthTitle(monthRef)}</div>
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => onMonthChange(addMonths(monthRef, 1))}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-[11px]">
        {ES_WEEKDAYS_SHORT.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: 42 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-md bg-muted/40" />
          ))}
        </div>
      ) : (
        <div className="mt-1 grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-border">
          {cells.map((cell) => {
            const slots = byDate.get(cell.iso) ?? [];
            const isPast = cell.iso < todayIso;
            const usable = slots.length > 0 && !isPast;
            const isSelectedDay = selectedDay === cell.iso;
            const hasChecked = slots.some((c) => selectedIds.has(c.id));
            return (
              <div
                key={cell.iso}
                onClick={() => usable && onSelectDay(isSelectedDay ? null : cell.iso)}
                className={[
                  "min-h-[52px] bg-surface p-1 sm:min-h-[96px]",
                  !cell.inMonth ? "bg-background/60" : "",
                  usable ? "cursor-pointer" : "",
                  isSelectedDay ? "ring-2 ring-inset ring-primary" : "",
                ].join(" ")}
              >
                <div className="mb-1 flex justify-center">
                  <span
                    className={[
                      "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full text-[11px] font-medium tabular-nums",
                      cell.isToday
                        ? "bg-primary text-primary-foreground"
                        : !cell.inMonth || isPast
                          ? "text-muted-foreground/50"
                          : "text-foreground",
                    ].join(" ")}
                  >
                    {cell.date.getDate()}
                  </span>
                </div>

                {/* Mobile: only availability dots; tap the day to see times below */}
                <div className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                  {slots.slice(0, 4).map((c) => (
                    <span
                      key={c.id}
                      className={[
                        "h-1.5 w-1.5 rounded-full",
                        isPast
                          ? "bg-muted-foreground/40"
                          : selectedIds.has(c.id)
                            ? "bg-primary"
                            : "bg-success",
                      ].join(" ")}
                      aria-hidden
                    />
                  ))}
                  {slots.length > 4 ? (
                    <span className="text-[8px] leading-none text-muted-foreground">
                      +{slots.length - 4}
                    </span>
                  ) : null}
                </div>

                {/* Desktop: full chips with time and teacher */}
                <ul className="hidden space-y-1 sm:block">
                  {slots.map((c) => {
                    const checked = selectedIds.has(c.id);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          disabled={isPast}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggle(c.id);
                          }}
                          className={[
                            "flex w-full flex-col gap-0.5 rounded border px-1 py-0.5 text-left leading-[1.15] transition-colors",
                            isPast
                              ? "cursor-not-allowed border-transparent bg-muted/40 text-muted-foreground/60"
                              : checked
                                ? "border-primary bg-primary/15 text-foreground"
                                : "border-border bg-background hover:bg-muted/50",
                          ].join(" ")}
                        >
                          <span className="flex items-center gap-1">
                            <span
                              className={[
                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                checked ? "bg-primary" : "bg-success",
                              ].join(" ")}
                              aria-hidden
                            />
                            <span className="text-[11px] font-semibold tabular-nums">
                              {formatTime(c.start_time)}
                            </span>
                          </span>
                          {c.teacher ? (
                            <span className="block text-[10px] text-muted-foreground">
                              {teacherShort(c.teacher)}
                            </span>
                          ) : null}
                          {c.audience === "kids" ? (
                            <span className="block text-[10px] text-muted-foreground">
                              niños
                            </span>
                          ) : null}

                        </button>
                      </li>
                    );
                  })}
                </ul>
                {hasChecked ? <span className="sr-only">Día con clases seleccionadas</span> : null}
              </div>
            );
          })}
        </div>
      )}


      <div className="mt-3 border-t border-border pt-3">
        {!selectedDay ? (
          <p className="text-xs text-muted-foreground">
            Toca un día con disponibilidad para ver los horarios.
          </p>
        ) : daySlots.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No hay horarios disponibles ese día.
          </p>
        ) : (
          <div>
            <div className="mb-2 text-xs font-semibold capitalize text-muted-foreground">
              {formatLongDate(selectedDay)}
            </div>
            <ul className="space-y-1.5">
              {daySlots.map((c) => {
                const checked = selectedIds.has(c.id);
                return (
                  <li key={c.id}>
                    <label
                      className={[
                        "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                        checked
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/40",
                      ].join(" ")}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => onToggle(c.id)} />
                      <span className="flex flex-col">
                        <span className="tabular-nums">
                          {formatTimeRange(c.start_time, c.end_time)}
                        </span>
                        {c.teacher ? (
                          <span className="text-xs text-muted-foreground">
                            Profe {c.teacher}
                          </span>
                        ) : null}
                      </span>
                      {c.audience === "kids" ? (
                        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Clase infantil
                        </span>
                      ) : (
                        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Adultos
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}