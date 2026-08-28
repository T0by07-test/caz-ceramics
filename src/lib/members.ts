import { ES_WEEKDAYS_SHORT, formatTime } from "@/lib/calendar";
import type { Role } from "@/lib/auth";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  instructora: "Instructora",
  user: "Miembro",
};

export type MembershipStatus = "active" | "paused" | "inactive";
export type Estado = "activa" | "pausada" | "inactiva" | "sin_actividad";

export const ESTADO_LABELS: Record<Estado, string> = {
  activa: "Activa",
  pausada: "Pausada",
  inactiva: "Inactiva",
  sin_actividad: "Sin actividad este mes",
};

/** paused/inactive → direct; else activa if booked-this-month OR regular; else sin_actividad. */
export function deriveEstado(
  membership: MembershipStatus,
  bookedThisMonth: boolean,
  isRegular: boolean,
): Estado {
  if (membership === "paused") return "pausada";
  if (membership === "inactive") return "inactiva";
  if (bookedThisMonth || isRegular) return "activa";
  return "sin_actividad";
}

export type RecurringSlot = {
  id: string;
  weekday: number;
  start_time: string;
  active: boolean;
  note: string | null;
};

/** weekday 0=Mon..6=Sun + "HH:MM:SS" → "Lun 18:30". */
export function formatSlot(weekday: number, startTime: string): string {
  return `${ES_WEEKDAYS_SHORT[weekday] ?? "?"} ${formatTime(startTime)}`;
}

export type MonthClassDay = { date: string; weekday: number };

/** One chip per distinct booked date this month, sorted ascending, plus a full-date tooltip. */
export function summarizeMonthClasses(days: MonthClassDay[]) {
  const byDate = new Map<string, number>();
  for (const d of days) byDate.set(d.date, d.weekday);
  const sortedDates = [...byDate.keys()].sort((a, b) => a.localeCompare(b));
  const chips = sortedDates.map((date) => ({
    date,
    letter: (ES_WEEKDAYS_SHORT[byDate.get(date)!] ?? "?")[0],
  }));
  const tooltip = sortedDates
    .map((date) => `${ES_WEEKDAYS_SHORT[byDate.get(date)!] ?? "?"} ${Number(date.slice(8, 10))}`)
    .join(", ");
  return { count: chips.length, chips, tooltip };
}
