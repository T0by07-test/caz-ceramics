import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const ACTIVE_STATUSES = ["reserved", "confirmed", "attended"];

/** Class ids the current student already has an active booking for. */
export function useMyBookedClassIds() {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) {
      setIds(new Set());
      return;
    }
    const { data } = await supabase
      .from("bookings")
      .select("class_id, status")
      .eq("student_id", user.id)
      .in("status", ACTIVE_STATUSES);
    setIds(new Set((data ?? []).map((b) => b.class_id)));
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`my-bookings-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `student_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, load]);

  return { bookedClassIds: ids, refresh: load };
}
