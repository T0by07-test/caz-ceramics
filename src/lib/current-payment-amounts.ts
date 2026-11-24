import { supabase } from "@/integrations/supabase/client";
import { withCurrentPendingAmounts } from "@/lib/finance/payment-group";

/** Read-only current quotes; keep Stripe snapshots and all settled rows intact. */
export async function currentPaymentAmounts<T extends { booking_id: string | null; status: string; amount_cents: number }>(payments: T[]): Promise<T[]> {
  const ids = [...new Set(payments.filter((p) => p.status === "pending" && p.booking_id).flatMap((p) => p.booking_id ? [p.booking_id] : []))];
  const amounts: { booking_id: string; amount_cents: number }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.rpc("pending_booking_amounts", { p_booking_ids: ids.slice(i, i + 100) });
    if (error) throw new Error("No se pudo actualizar el importe pendiente. Vuelve a intentarlo.");
    amounts.push(...(data ?? []));
  }
  return withCurrentPendingAmounts(payments, amounts);
}