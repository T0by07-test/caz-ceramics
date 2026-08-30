import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withoutClosedDates } from "@/lib/closures";

export type ClassRow = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity_ideal: number;
  capacity_max: number;
  status: "scheduled" | "auto_cancelled" | "cancelled_by_admin";
  instructor_id: string | null;
  audience: "adults" | "kids";
  teacher: string | null;
};

export type ClassWithCount = ClassRow & {
  booked_count: number;
};

const ACTIVE_BOOKING_STATUSES = ["reserved", "confirmed", "attended"] as const;

/**
 * Fetches classes within an inclusive ISO date range, plus a live booked count
 * per class. Subscribes to Realtime on classes + bookings and refetches on change.
 *
 * @param range  inclusive { startIso, endIso } (YYYY-MM-DD)
 * @param mode   "student" hides non-scheduled classes; "admin" shows all.
 */
export function useClassesInRange(
  range: { startIso: string; endIso: string },
  mode: "student" | "admin",
) {
  const { startIso, endIso } = range;
  const [classes, setClasses] = useState<ClassWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    let q = supabase
      .from("classes")
      .select(
        "id, date, start_time, end_time, capacity_ideal, capacity_max, status, instructor_id, audience, teacher",
      )
      .gte("date", startIso)
      .lte("date", endIso)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (mode === "student") {
      q = q.eq("status", "scheduled");
    }

    const { data: allRows, error: classErr } = await q;
    if (classErr) {
      setError(classErr.message);
      setLoading(false);
      return;
    }

    // Students never see classes on studio closure dates.
    const classRows = mode === "student" ? withoutClosedDates(allRows ?? []) : (allRows ?? []);

    const ids = (classRows ?? []).map((c) => c.id);

    let counts = new Map<string, number>();
    if (ids.length > 0) {
      if (mode === "student") {
        // A regular student's RLS grants (bookings_select_own) only let them
        // see their OWN booking rows, so a direct bookings query here would
        // undercount every class they're not personally in. The SECURITY
        // DEFINER RPC returns just the aggregate count (no roster), which is
        // the same source the public "Solicitar plaza" calendar uses.
        const idSet = new Set(ids);
        const { data: availability, error: availErr } = await supabase.rpc(
          "public_class_availability",
        );
        if (availErr) {
          setError(availErr.message);
          setLoading(false);
          return;
        }
        counts = new Map(
          (availability ?? [])
            .filter((r) => idSet.has(r.class_id))
            .map((r) => [r.class_id, r.booked_count]),
        );
      } else {
        const { data: bookings, error: bErr } = await supabase
          .from("bookings")
          .select("class_id, status")
          .in("class_id", ids)
          .in("status", ACTIVE_BOOKING_STATUSES as unknown as string[]);
        if (bErr) {
          setError(bErr.message);
          setLoading(false);
          return;
        }
        counts = (bookings ?? []).reduce((acc, b) => {
          acc.set(b.class_id, (acc.get(b.class_id) ?? 0) + 1);
          return acc;
        }, new Map<string, number>());
      }
    }

    setClasses(
      (classRows ?? []).map((c) => ({
        ...(c as ClassRow),
        booked_count: counts.get(c.id) ?? 0,
      })),
    );
    setLoading(false);
  }, [startIso, endIso, mode]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel(`classes-range-${startIso}-${endIso}-${mode}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "classes" },
        () => void fetchData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => void fetchData(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchData, startIso, endIso, mode]);

  return { classes, loading, error, refresh: fetchData };
}
