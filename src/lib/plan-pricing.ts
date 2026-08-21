import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Plan = {
  id: string;
  name: string;
  classes_per_month: number;
  price_cents: number;
};

export function useActivePlans() {
  const [plans, setPlans] = useState<Plan[] | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("plans")
        .select("id, name, classes_per_month, price_cents")
        .eq("active", true)
        .order("classes_per_month", { ascending: true });
      setPlans((data ?? []) as Plan[]);
    })();
  }, []);

  return plans;
}

/**
 * Price for a number of classes in a month: the cheapest plan that covers the
 * selected amount; if the student picks more classes than the biggest plan,
 * the biggest plan applies (plans allow booking without extra limits).
 */
export function planForCount(plans: Plan[] | null, count: number): Plan | null {
  if (!plans || plans.length === 0 || count <= 0) return null;
  const sorted = [...plans].sort((a, b) => a.classes_per_month - b.classes_per_month);
  return sorted.find((p) => p.classes_per_month >= count) ?? sorted[sorted.length - 1]!;
}

export function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}
