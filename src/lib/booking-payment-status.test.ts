import { describe, expect, it } from "vitest";
import { pendingBookingCents, resolveBookingPaymentStatus } from "./booking-payment-status";

describe("authoritative pending amounts", () => {
  it("does not turn an unpriced zero euro hold into a 30 euro debt", () => {
    expect(pendingBookingCents([{ status: "pending", amount_cents: 0 }])).toBe(0);
  });
  it("keeps the 15 euro fourth-class increment rather than assuming 30 euros", () => {
    expect(pendingBookingCents([{ status: "pending", amount_cents: 1500 }, { status: "pending", amount_cents: 1500 }])).toBe(1500);
  });
  it("shows no debt for an already settled 85 euro payment", () => {
    expect(pendingBookingCents([{ status: "confirmed", amount_cents: 8500 }, { status: "pending", amount_cents: 8500 }])).toBe(0);
  });
});

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
