import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Returns the signed-in student's subscription for the given month
 * (defaults to the current month). Refreshes when subscriptions change.
 */
export function useMyPlan(month?: Date) {
  const { user } = useAuth();
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [creditsTotal, setCreditsTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refMonth = month ?? new Date();
  const monthIso = `${refMonth.getFullYear()}-${String(refMonth.getMonth() + 1).padStart(2, "0")}-01`;

  const fetchPlan = useCallback(async () => {
    if (!user) {
      setCreditsRemaining(null);
      setCreditsTotal(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("subscriptions")
      .select("credits_remaining, credits_total")
      .eq("student_id", user.id)
      .eq("month", monthIso)
      .maybeSingle();
    setCreditsRemaining(data?.credits_remaining ?? 0);
    setCreditsTotal(data?.credits_total ?? 0);
    setLoading(false);
  }, [user, monthIso]);

  useEffect(() => {
    void fetchPlan();
  }, [fetchPlan]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`my-subs-${user.id}-${monthIso}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `student_id=eq.${user.id}` },
        () => void fetchPlan(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, monthIso, fetchPlan]);

  return { creditsRemaining, creditsTotal, loading, refresh: fetchPlan };
}