import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { selectionPriceCentsWithGuests } from "@/lib/pricing";

/**
 * Price the student actually owes for a selection, discounting what she already
 * paid this month (only the difference to the next monthly tier is charged).
 * Falls back to the plain tier price while loading or on error.
 */
export function useSelectionQuote(
  classes: { id: string; audience?: string | null }[],
  guests: number,
): number {
  const fallback = selectionPriceCentsWithGuests(classes, guests);
  const key = classes.map((c) => c.id).sort().join(",");
  const [quote, setQuote] = useState<{ key: string; cents: number } | null>(null);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    void supabase
      .rpc("quote_my_selection", { p_class_ids: key.split(","), p_guests: guests })
      .then(({ data, error }) => {
        if (alive && !error && typeof data === "number") setQuote({ key: `${key}|${guests}`, cents: data });
      });
    return () => {
      alive = false;
    };
  }, [key, guests]);

  return quote && quote.key === `${key}|${guests}` ? quote.cents : fallback;
}
