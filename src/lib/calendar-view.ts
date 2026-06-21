import { z } from "zod";
import {
  addDays,
  addMonths,
  addWeeks,
  dayRange,
  formatDayTitle,
  formatMonthTitle,
  formatWeekTitle,
  monthGridRange,
  weekRange,
} from "@/lib/calendar";

export type CalendarView = "month" | "week" | "day";

// Bad/missing params fall back to month + undefined date (no throw on navigation).
export const calendarSearchSchema = z.object({
  view: z.enum(["month", "week", "day"]).catch("month"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
});
export type CalendarSearch = z.infer<typeof calendarSearchSchema>;

/** ISO date param → local Date; falls back to "now" when absent/invalid. */
export function parseReference(dateParam?: string): Date {
  if (dateParam) {
    const [y, m, d] = dateParam.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return new Date();
}

/** week → Mon..Sun; day → single day; month → 6-week grid range. */
export function rangeForView(view: CalendarView, reference: Date): { startIso: string; endIso: string } {
  if (view === "week") return weekRange(reference);
  if (view === "day") return dayRange(reference);
  return monthGridRange(reference);
}

/** Step the reference by one unit of the active view. */
export function shiftReference(view: CalendarView, reference: Date, dir: -1 | 1): Date {
  if (view === "week") return addWeeks(reference, dir);
  if (view === "day") return addDays(reference, dir);
  return addMonths(reference, dir);
}

/** month "junio 2026" · week "15 – 21 junio 2026" · day "domingo 21 de junio". */
export function viewTitle(view: CalendarView, reference: Date): string {
  if (view === "week") return formatWeekTitle(reference);
  if (view === "day") return formatDayTitle(reference);
  return formatMonthTitle(reference);
}
