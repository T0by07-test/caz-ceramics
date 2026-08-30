import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const ACTIVE_BOOKING_STATUSES = ["reserved", "confirmed", "attended"] as const;

/**
 * Returns the signed-in student's plan status for the given month (defaults
 * to the current month): whether they have one, its name, how many classes
 * it includes, and how many of those they've already booked (source='plan')
 * this month — so the calendar can offer "book with my plan" only while
 * credits remain. Refreshes when subscriptions or bookings change.
 */
export function useMyPlan(month?: Date) {
  const { user } = useAuth();
  const [hasPlan, setHasPlan] = useState(false);
  const [planName, setPlanName] = useState<string | null>(null);
  const [classesPerMonth, setClassesPerMonth] = useState(0);
  const [usedThisMonth, setUsedThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);

  const refMonth = month ?? new Date();
  const monthIso = `${refMonth.getFullYear()}-${String(refMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonthIso = `${refMonth.getFullYear()}-${String(refMonth.getMonth() + 2).padStart(2, "0")}-01`;

  const fetchPlan = useCallback(async () => {
    if (!user) {
      setHasPlan(false);
      setPlanName(null);
      setClassesPerMonth(0);
      setUsedThisMonth(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, plans(name, classes_per_month)")
      .eq("student_id", user.id)
      .eq("month", monthIso)
      .maybeSingle();
    const planRel = (
      sub as { plans?: { name?: string | null; classes_per_month?: number | null } | null } | null
    )?.plans;
    setHasPlan(Boolean(sub?.id));
    setPlanName(planRel?.name ?? null);
    setClassesPerMonth(planRel?.classes_per_month ?? 0);

    const { data: used } = await supabase
      .from("bookings")
      .select("id, classes!inner(date)")
      .eq("student_id", user.id)
      .eq("source", "plan")
      .in("status", ACTIVE_BOOKING_STATUSES as unknown as string[])
      .gte("classes.date", monthIso)
      .lt("classes.date", nextMonthIso);
    setUsedThisMonth(used?.length ?? 0);
    setLoading(false);
  }, [user, monthIso, nextMonthIso]);

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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `student_id=eq.${user.id}`,
        },
        () => void fetchPlan(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, monthIso, fetchPlan]);

  const remaining = Math.max(0, classesPerMonth - usedThisMonth);

  return {
    hasPlan,
    planName,
    classesPerMonth,
    usedThisMonth,
    remaining,
    loading,
    refresh: fetchPlan,
  };
}
