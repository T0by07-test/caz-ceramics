import { describe, expect, it } from "vitest";
import { billingMonthKey, groupPricedClassesByMonth } from "../../supabase/functions/_shared/class-billing";

describe("authoritative checkout billing months", () => {
  it("groups the four dates from Cande's screenshot as December for 85 euros, not 100", () => {
    const rows = groupPricedClassesByMonth([
      { date: "2026-11-28", billing_month: "2026-12-01", start_time: "17:00", amount_cents: 3000 },
      { date: "2026-12-02", start_time: "15:00", amount_cents: 2500 },
      { date: "2026-12-09", start_time: "15:00", amount_cents: 1500 },
      { date: "2026-12-16", start_time: "10:30", amount_cents: 1500 },
    ]);
    expect(rows).toEqual([{ month: "2026-12", cents: 8500, dates: ["28/11 17:00", "02/12 15:00", "09/12 15:00", "16/12 10:30"] }]);
  });
  it.each(["10:00", "17:00"])("puts Saturday at %s and two December dates in one 70 euro line", (start_time) => {
    const rows = groupPricedClassesByMonth([
      { date: "2026-11-28", billing_month: "2026-12-01", start_time, amount_cents: 3000 },
      { date: "2026-12-01", start_time: "18:30", amount_cents: 2500 },
      { date: "2026-12-08", start_time: "18:30", amount_cents: 1500 },
    ]);
    expect(rows).toEqual([{ month: "2026-12", cents: 7000, dates: [`28/11 ${start_time}`, "01/12 18:30", "08/12 18:30"] }]);
  });
  it("keeps November independent and retains server-provided incremental amounts", () => {
    const rows = groupPricedClassesByMonth([
      { date: "2026-11-26", start_time: "16:00", amount_cents: 2500 },
      { date: "2026-11-28", billing_month: "2026-12-01", start_time: "10:00", amount_cents: 1500 },
      { date: "2026-12-01", start_time: "18:30", amount_cents: 1500 },
    ]);
    expect(rows.map(({ month, cents }) => ({ month, cents }))).toEqual([
      { month: "2026-11", cents: 2500 }, { month: "2026-12", cents: 3000 },
    ]);
    expect(billingMonthKey({ date: "2026-11-28", billing_month: "2026-12-01" })).toBe("2026-12");
  });
});