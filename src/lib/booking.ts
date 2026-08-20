import { supabase } from "@/integrations/supabase/client";

export type BookSource = "plan" | "drop_in";

export type BookResult = { booking_id: string; status: string };
export type CancelResult = {
  booking_id: string;
  status: string;
  makeup_id: string | null;
};

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Inicia sesión para continuar.",
  INVALID_SOURCE: "Tipo de reserva no válido.",
  CLASS_NOT_FOUND: "La clase ya no existe.",
  CLASS_NOT_SCHEDULED: "Esta clase no está disponible.",
  CLASS_FULL: "La clase está completa.",
  NO_PLAN_THIS_MONTH: "No tienes un plan activo este mes.",
  BOOKING_NOT_FOUND: "La reserva no existe.",
  NOT_OWNER: "No puedes cancelar una reserva que no es tuya.",
  ALREADY_BOOKED: "Ya tienes una reserva en esta clase.",
  NO_MAKEUPS_AVAILABLE: "No tienes recuperaciones disponibles.",
};

export function friendlyError(raw: string | undefined | null): string {
  if (!raw) return "Ha ocurrido un error.";
  const code = raw.match(/^[A-Z_]+/)?.[0] ?? raw;
  return ERROR_MESSAGES[code] ?? raw;
}

export async function bookClass(classId: string, source: BookSource): Promise<BookResult> {
  const { data, error } = await supabase.rpc("book_class", {
    p_class_id: classId,
    p_source: source,
  });
  if (error) throw new Error(friendlyError(error.message));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Respuesta vacía del servidor.");
  return row as BookResult;
}

export async function bookMakeup(classId: string): Promise<{ booking_id: string; makeup_id: string }> {
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)("book_makeup", {
    p_class_id: classId,
  });
  if (error) throw new Error(friendlyError(error.message));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Respuesta vacía del servidor.");
  return row as { booking_id: string; makeup_id: string };
}

export async function cancelBooking(bookingId: string): Promise<CancelResult> {
  const { data, error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
  });
  if (error) throw new Error(friendlyError(error.message));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Respuesta vacía del servidor.");
  return row as CancelResult;
}

/** Cancellation window (hours before class start) for a recoverable cancellation. */
export const CANCELLATION_WINDOW_HOURS = 12;

/** Returns true iff cancellation right now would be recoverable (>12h before start). */
export function isRecoverableNow(classDateIso: string, startTime: string): boolean {
  const [y, m, d] = classDateIso.split("-").map(Number);
  const [hh, mm] = startTime.split(":").map(Number);
  // Treat the stored values as Europe/Madrid wall-clock — close enough for the
  // cutoff display (server enforces the real boundary).
  const start = new Date(y, m - 1, d, hh, mm, 0).getTime();
  return Date.now() < start - CANCELLATION_WINDOW_HOURS * 60 * 60 * 1000;
}