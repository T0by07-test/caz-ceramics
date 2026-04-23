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