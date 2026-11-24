import { describe, expect, it } from "vitest";
import { appPaymentGroupKey, visibleIncomePayments, withCurrentPendingAmounts } from "./payment-group";

const cash = { id: "payment", student_id: "student", method: "cash", status: "confirmed", stripe_session_id: "cash:booking" };
describe("income payment grouping", () => {
  it("shows two remaining unpaid classes at 55 euros, not old 15-euro card attempts", () => {
    const rows = [
      { ...cash, id: "third", booking_id: "third", subscription_id: null, status: "pending", method: "card", created_at: "2026-11-24T09:00:00Z", amount_cents: 1500 },
      { ...cash, id: "fourth", booking_id: "fourth", subscription_id: null, status: "pending", method: "card", created_at: "2026-11-24T09:00:00Z", amount_cents: 1500 },
    ];
    const updated = withCurrentPendingAmounts(rows, [{ booking_id: "third", amount_cents: 3000 }, { booking_id: "fourth", amount_cents: 2500 }]);
    expect(visibleIncomePayments(updated).reduce((sum, p) => sum + p.amount_cents, 0)).toBe(5500);
    expect(rows.map((p) => p.amount_cents)).toEqual([1500, 1500]);
  });
  it("removes only inactive pending debt, preserving confirmed and failed history exactly", () => {
    const rows = [
      { ...cash, id: "paid", booking_id: "settled", amount_cents: 8500 },
      { ...cash, id: "failed", booking_id: "cancelled", status: "failed", amount_cents: 3000 },
      { ...cash, id: "pending", booking_id: "cancelled", status: "pending", amount_cents: 2500 },
    ];
    expect(withCurrentPendingAmounts(rows, [])).toEqual([rows[0], rows[1]]);
  });
  it("keeps an edited cash amount instead of replacing it with a card snapshot", () => {
    const row = { ...cash, booking_id: "booking", status: "pending", amount_cents: 2700 };
    expect(withCurrentPendingAmounts([row], [{ booking_id: "booking", amount_cents: 2700 }])).toEqual([row]);
  });
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