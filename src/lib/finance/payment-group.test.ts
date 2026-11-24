import { describe, expect, it } from "vitest";
import { appPaymentGroupKey, visibleIncomePayments } from "./payment-group";

const cash = { id: "payment", student_id: "student", method: "cash", status: "confirmed", stripe_session_id: "cash:booking" };
describe("income payment grouping", () => {
  it("shows one 85 euro debt when the same four-class cash booking also has a pending card attempt", () => {
    const rows = [
      { ...cash, id: "cash", booking_id: "four-class-booking", subscription_id: null, status: "pending", created_at: "2026-11-24T09:00:00Z", amount_cents: 8500 },
      { ...cash, id: "card", booking_id: "four-class-booking", subscription_id: null, status: "pending", method: "card", stripe_session_id: "cs_test", created_at: "2026-11-24T09:01:00Z", amount_cents: 8500 },
    ];
    const visible = visibleIncomePayments(rows);
    expect(visible.map((p) => p.id)).toEqual(["cash"]);
    expect(visible.reduce((sum, p) => sum + p.amount_cents, 0)).toBe(8500);
    expect(rows.map((p) => p.amount_cents)).toEqual([8500, 8500]);
  });
  it("keeps every settled payment and suppresses only pending alternatives", () => {
    const rows = [
      { ...cash, id: "paid", booking_id: "booking", subscription_id: null, created_at: "2026-11-24T09:00:00Z", amount_cents: 8500 },
      { ...cash, id: "pending", booking_id: "booking", subscription_id: null, status: "pending", created_at: "2026-11-24T09:01:00Z", amount_cents: 8500 },
    ];
    expect(visibleIncomePayments(rows).map((p) => p.id)).toEqual(["paid"]);
    expect(visibleIncomePayments([...rows, { ...rows[0], ...cash, id: "second-paid", booking_id: "booking", subscription_id: null, created_at: "2026-11-24T09:02:00Z", amount_cents: 8500 }]).filter((p) => p.status === "confirmed").length).toBe(2);
  });
  it("keeps a collected 85 euro purchase separate from a pending 20 euro added class", () => {
    const rows = [{ ...cash, amount: 8500 }, { ...cash, id: "extra", status: "pending", amount: 2000 }];
    const totals = new Map<string, number>();
    for (const row of rows) {
      const key = appPaymentGroupKey(row, "2026-11");
      totals.set(key, (totals.get(key) ?? 0) + row.amount);
    }
    expect(totals.get("cash|student|2026-11|collected")).toBe(8500);
    expect(totals.get("cash|student|2026-11|pending")).toBe(2000);
  });
  it("keeps November and December distinct even in the same card checkout", () => {
    const card = { ...cash, method: "card", stripe_session_id: "checkout" };
    expect(appPaymentGroupKey(card, "2026-11")).not.toBe(appPaymentGroupKey(card, "2026-12"));
  });
});