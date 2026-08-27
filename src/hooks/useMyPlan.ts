import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Returns whether the signed-in student has a plan for the given month
 * (defaults to the current month). Refreshes when subscriptions change.
 */
export function useMyPlan(month?: Date) {
  const { user } = useAuth();
  const [hasPlan, setHasPlan] = useState(false);
  const [planName, setPlanName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refMonth = month ?? new Date();
  const monthIso = `${refMonth.getFullYear()}-${String(refMonth.getMonth() + 1).padStart(2, "0")}-01`;

  const fetchPlan = useCallback(async () => {
    if (!user) {
      setHasPlan(false);
      setPlanName(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("subscriptions")
      .select("id, plans(name)")
      .eq("student_id", user.id)
      .eq("month", monthIso)
      .maybeSingle();
    setHasPlan(Boolean(data?.id));
    const planRel = (data as { plans?: { name?: string | null } | null } | null)?.plans;
    setPlanName(planRel?.name ?? null);
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
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `student_id=eq.${user.id}`,
        },
        () => void fetchPlan(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, monthIso, fetchPlan]);

  return { hasPlan, planName, loading, refresh: fetchPlan };
}
