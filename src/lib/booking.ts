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
  NO_CREDITS_REMAINING: "No te quedan créditos en tu plan este mes.",
  BOOKING_NOT_FOUND: "La reserva no existe.",
  NOT_OWNER: "No puedes cancelar una reserva que no es tuya.",
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

export async function cancelBooking(bookingId: string): Promise<CancelResult> {
  const { data, error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
  });
  if (error) throw new Error(friendlyError(error.message));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Respuesta vacía del servidor.");
  return row as CancelResult;
}

/** Returns true iff cancellation right now would be recoverable (>3h before start). */
export function isRecoverableNow(classDateIso: string, startTime: string): boolean {
  const [y, m, d] = classDateIso.split("-").map(Number);
  const [hh, mm] = startTime.split(":").map(Number);
  // Treat the stored values as Europe/Madrid wall-clock — close enough for the
  // cutoff display (server enforces the real boundary).
  const start = new Date(y, m - 1, d, hh, mm, 0).getTime();
  return Date.now() < start - 3 * 60 * 60 * 1000;
}