import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Number of already-paid classes the student cancelled in time and can still
 * re-book on another day without paying again (public.makeups rows that are
 * unused and not expired).
 */
export function useMyMakeups() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("makeups")
      .select("id")
      .eq("student_id", user.id)
      .is("used_booking_id", null)
      .gte("expires_at", new Date().toISOString());
    setCount(data?.length ?? 0);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`my-makeups-count-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "makeups", filter: `student_id=eq.${user.id}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, refresh]);

  return { count, loading, refresh };
}
