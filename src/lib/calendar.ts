// Date helpers for the monthly calendar. Monday-start. es-ES locale, Europe/Madrid.

export type DayCell = {
  date: Date;
  iso: string; // YYYY-MM-DD in local time
  inMonth: boolean;
  isToday: boolean;
};

export const ES_WEEKDAYS_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const ES_MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Day index 0..6 with Monday = 0. */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** 6×7 grid of days for the given month, Monday-first. */
export function buildMonthGrid(reference: Date): DayCell[] {
  const first = startOfMonth(reference);
  const offset = mondayIndex(first);
  const start = new Date(first);
  start.setDate(first.getDate() - offset);

  const today = new Date();
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      date: d,
      iso: toIsoDate(d),
      inMonth: d.getMonth() === reference.getMonth(),
      isToday: sameDay(d, today),
    });
  }
  return cells;
}

/** Inclusive ISO range covering the visible 6-week grid (for query filters). */
export function monthGridRange(reference: Date): { startIso: string; endIso: string } {
  const cells = buildMonthGrid(reference);
  return { startIso: cells[0].iso, endIso: cells[cells.length - 1].iso };
}

export function formatMonthTitle(d: Date): string {
  return `${ES_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Format "HH:MM" -> "HH:MM" (drop seconds if Postgres returned HH:MM:SS). */
export function formatTime(t: string): string {
  return t.slice(0, 5);
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][
    date.getDay()
  ];
  return `${weekday} ${d} de ${ES_MONTHS[m - 1]}`;
}

/** Capacity status -> design token color name. */
export type CapacityLevel = "available" | "filling" | "full";

export function capacityLevel(booked: number, capacityMax: number): CapacityLevel {
  if (booked >= capacityMax) return "full";
  if (booked >= 5) return "filling";
  return "available";
}

export function capacityDotClass(level: CapacityLevel): string {
  if (level === "full") return "bg-destructive";
  if (level === "filling") return "bg-warning";
  return "bg-success";
}

export function capacityLabel(level: CapacityLevel): string {
  if (level === "full") return "Completa";
  if (level === "filling") return "Casi completa";
  return "Disponible";
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

export function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

/** Monday (00:00 local) of the week containing `reference`. */
export function startOfWeek(reference: Date): Date {
  const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  start.setDate(start.getDate() - mondayIndex(reference));
  return start;
}

/**
 * 7 day cells Mon..Sun for the week containing `reference`.
 * e.g. buildWeekDays(2026-06-21 Sun) → days[0].iso "2026-06-15", days[6].iso "2026-06-21".
 */
export function buildWeekDays(reference: Date): DayCell[] {
  const start = startOfWeek(reference);
  const today = new Date();
  const cells: DayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    cells.push({
      date: d,
      iso: toIsoDate(d),
      inMonth: d.getMonth() === reference.getMonth(),
      isToday: sameDay(d, today),
    });
  }
  return cells;
}

/** Inclusive ISO range Mon..Sun for the week containing `reference`. */
export function weekRange(reference: Date): { startIso: string; endIso: string } {
  const days = buildWeekDays(reference);
  return { startIso: days[0].iso, endIso: days[6].iso };
}

/** Inclusive ISO range for a single day. */
export function dayRange(reference: Date): { startIso: string; endIso: string } {
  const iso = toIsoDate(reference);
  return { startIso: iso, endIso: iso };
}

/**
 * e.g. same-month "15 – 21 junio 2026"; cross-month "29 jun – 5 jul 2026".
 */
export function formatWeekTitle(reference: Date): string {
  const days = buildWeekDays(reference);
  const a = days[0].date;
  const b = days[6].date;
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()} – ${b.getDate()} ${ES_MONTHS[a.getMonth()]} ${b.getFullYear()}`;
  }
  return `${a.getDate()} ${ES_MONTHS[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${ES_MONTHS[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`;
}

/** e.g. formatDayTitle(2026-06-21) → "domingo 21 de junio". */
export function formatDayTitle(reference: Date): string {
  return formatLongDate(toIsoDate(reference));
}

/**
 * [minHour, maxHour] (inclusive) spanning the given "HH:MM:SS" times; [9, 22] when empty.
 * e.g. ["18:30:00","20:00:00"] → [18, 20]; [] → [9, 22].
 */
export function dayHourBounds(times: string[]): [number, number] {
  if (times.length === 0) return [9, 22];
  let min = 23;
  let max = 0;
  for (const t of times) {
    const h = Number(t.slice(0, 2));
    if (h < min) min = h;
    if (h > max) max = h;
  }
  return [Math.max(0, min), Math.min(23, max)];
}