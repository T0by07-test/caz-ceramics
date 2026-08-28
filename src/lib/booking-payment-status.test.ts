import { describe, expect, it } from "vitest";
import { resolveBookingPaymentStatus } from "./booking-payment-status";

describe("resolveBookingPaymentStatus", () => {
  it("marks a cancelled booking as cancelled regardless of payment", () => {
    const result = resolveBookingPaymentStatus(
      { status: "cancelled_lost", source: "drop_in", booking_id_payment_status: "confirmed" },
      null,
    );
    expect(result).toBe("cancelled");
  });

  it("resolves a drop-in booking from its own payment status", () => {
    expect(
      resolveBookingPaymentStatus(
        { status: "reserved", source: "drop_in", booking_id_payment_status: "pending" },
        null,
      ),
    ).toBe("pending");
    expect(
      resolveBookingPaymentStatus(
        { status: "reserved", source: "drop_in", booking_id_payment_status: "confirmed" },
        null,
      ),
    ).toBe("paid");
  });

  it("resolves a plan booking from the student's subscription payment status", () => {
    expect(
      resolveBookingPaymentStatus(
        { status: "confirmed", source: "plan", booking_id_payment_status: null },
        "pending",
      ),
    ).toBe("pending");
    expect(
      resolveBookingPaymentStatus(
        { status: "confirmed", source: "plan", booking_id_payment_status: null },
        "confirmed",
      ),
    ).toBe("paid");
  });

  it("treats a plan booking with no subscription payment record as paid", () => {
    expect(
      resolveBookingPaymentStatus(
        { status: "confirmed", source: "plan", booking_id_payment_status: null },
        null,
      ),
    ).toBe("paid");
  });
});
