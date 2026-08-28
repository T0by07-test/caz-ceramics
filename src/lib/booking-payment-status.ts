export type BookingPaymentStatus = "paid" | "pending" | "cancelled";

type PaymentStatus = "pending" | "confirmed" | "failed" | null;

/**
 * A "plan" booking is paid at the monthly subscription level, not per class —
 * only "drop_in" bookings carry their own payment row (payments.booking_id).
 */
export function resolveBookingPaymentStatus(
  booking: { status: string; source: string; booking_id_payment_status: PaymentStatus },
  subscriptionPaymentStatus: PaymentStatus,
): BookingPaymentStatus {
  if (booking.status === "cancelled_recoverable" || booking.status === "cancelled_lost") {
    return "cancelled";
  }
  const relevantStatus =
    booking.source === "drop_in" ? booking.booking_id_payment_status : subscriptionPaymentStatus;
  return relevantStatus === "pending" || relevantStatus === "failed" ? "pending" : "paid";
}
