import { describe, expect, it } from "vitest";
import { appPaymentGroupKey } from "./payment-group";

const cash = { id: "payment", student_id: "student", method: "cash", status: "confirmed", stripe_session_id: "cash:booking" };
describe("income payment grouping", () => {
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