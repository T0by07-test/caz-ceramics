const KEY = "pending-bookings";

export type PendingBookings = { month: string; classIds: string[] };

export function savePendingBookings(value: PendingBookings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function loadPendingBookings(): PendingBookings | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingBookings;
    if (!parsed || !Array.isArray(parsed.classIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingBookings() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
