type PaymentGroupingInput = {
  id: string;
  student_id: string;
  method: string | null;
  status: string;
  stripe_session_id: string | null;
};

type IncomePaymentInput = PaymentGroupingInput & {
  booking_id: string | null;
  subscription_id: string | null;
  created_at: string;
};

/** Pending payment methods are alternatives; all genuinely settled rows remain visible. */
export function visibleIncomePayments<T extends IncomePaymentInput>(payments: T[]): T[] {
  const purchaseKey = (p: T) => p.booking_id ? `booking|${p.booking_id}`
    : p.subscription_id ? `subscription|${p.subscription_id}` : `payment|${p.id}`;
  const settled = new Set(payments.filter((p) => p.status === "confirmed").map(purchaseKey));
  const pending = new Map<string, T>();
  for (const p of payments) {
    if (p.status !== "pending" || settled.has(purchaseKey(p))) continue;
    const key = purchaseKey(p);
    const current = pending.get(key);
    const cash = p.method === "cash" || p.stripe_session_id?.startsWith("cash:") === true;
    const currentCash = current?.method === "cash" || current?.stripe_session_id?.startsWith("cash:") === true;
    if (!current || (cash && !currentCash) || (cash === currentCash && p.created_at > current.created_at)) pending.set(key, p);
  }
  const pendingIds = new Set([...pending.values()].map((p) => p.id));
  return payments.filter((p) => p.status === "confirmed" || pendingIds.has(p.id));
}

export function appPaymentGroupKey(payment: PaymentGroupingInput, month: string): string {
  const cash = payment.method === "cash" || payment.stripe_session_id?.startsWith("cash:");
  const state = payment.status === "confirmed" ? "collected" : "pending";
  const purchase = cash ? `cash|${payment.student_id}` : payment.stripe_session_id ?? payment.id;
  return `${purchase}|${month}|${state}`;
}