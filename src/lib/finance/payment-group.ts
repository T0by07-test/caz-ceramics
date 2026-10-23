type PaymentGroupingInput = {
  id: string;
  student_id: string;
  method: string | null;
  status: string;
  stripe_session_id: string | null;
};

export function appPaymentGroupKey(payment: PaymentGroupingInput, month: string): string {
  const cash = payment.method === "cash" || payment.stripe_session_id?.startsWith("cash:");
  const state = payment.status === "confirmed" ? "collected" : "pending";
  const purchase = cash ? `cash|${payment.student_id}` : payment.stripe_session_id ?? payment.id;
  return `${purchase}|${month}|${state}`;
}