import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { groupSelectionByMonth, monthlySelectionBreakdown } from "@/lib/pricing";

/**
 * Price the student actually owes for a selection, discounting what she already
 * paid this month (only the difference to the next monthly tier is charged).
 * Falls back to the plain tier price while loading or on error.
 */
export function useSelectionQuote(
  classes: { id: string; date: string; audience?: string | null }[],
  guests: number,
): number {
  return useSelectionQuoteBreakdown(classes, guests).reduce((sum, row) => sum + row.cents, 0);
}

export function useSelectionQuoteBreakdown(
  classes: { id: string; date: string; audience?: string | null }[],
  guests: number,
) {
  const fallback = monthlySelectionBreakdown(classes, guests);
  const groups = groupSelectionByMonth(classes);
  const key = JSON.stringify(groups.map(({ month, classes: items }) => ({ month, ids: items.map((c) => c.id).sort() })));
  const [quote, setQuote] = useState<{ key: string; rows: typeof fallback } | null>(null);

  useEffect(() => {
    let alive = true;
    const selections = JSON.parse(key) as { month: string; ids: string[] }[];
    void Promise.all(selections.map(async ({ month, ids }) => {
      const { data, error } = await supabase.rpc("quote_my_selection", { p_class_ids: ids, p_guests: guests });
      if (error || typeof data !== "number") return null;
      return { month, count: ids.length, cents: data };
    })).then((rows) => {
      if (alive && rows.every((row) => row !== null)) setQuote({ key: `${key}|${guests}`, rows: rows.filter((row) => row !== null) });
    });
    return () => {
      alive = false;
    };
  }, [key, guests]);

  return quote && quote.key === `${key}|${guests}` ? quote.rows : fallback;
}
