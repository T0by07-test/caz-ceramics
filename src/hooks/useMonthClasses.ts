import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { monthGridRange } from "@/lib/calendar";

export type ClassRow = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity_ideal: number;
  capacity_max: number;
  status: "scheduled" | "auto_cancelled" | "cancelled_by_admin";
};

export type ClassWithCount = ClassRow & {
  booked_count: number;
};

const ACTIVE_BOOKING_STATUSES = [
  "reserved",
  "confirmed",
  "attended",
] as const;

/**
 * Fetches classes for the visible month grid, plus a live booked count per class.
 * Subscribes to Realtime updates on classes + bookings and refetches on change.
 *
 * @param referenceMonth A date inside the desired month
 * @param mode "student" hides non-scheduled classes (RLS would do this anyway,
 *             but we filter client-side too for clarity); "admin" shows all.
 */
export function useMonthClasses(referenceMonth: Date, mode: "student" | "admin") {
  const [classes, setClasses] = useState<ClassWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { startIso, endIso } = monthGridRange(referenceMonth);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    let q = supabase
      .from("classes")
      .select("id, date, start_time, end_time, capacity_ideal, capacity_max, status")
      .gte("date", startIso)
      .lte("date", endIso)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (mode === "student") {
      q = q.eq("status", "scheduled");
    }

    const { data: classRows, error: classErr } = await q;
    if (classErr) {
      setError(classErr.message);
      setLoading(false);
      return;
    }

    const ids = (classRows ?? []).map((c) => c.id);
    let counts = new Map<string, number>();
    if (ids.length > 0) {
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

  // Realtime: refetch on any change in classes or bookings.
  useEffect(() => {
    const channel = supabase
      .channel(`month-classes-${startIso}-${endIso}-${mode}`)
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