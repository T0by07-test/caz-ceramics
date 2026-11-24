import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { friendlyError } from "./booking";
import { monthlySelectionBreakdown } from "./pricing";

describe("calendar-month rules", () => {
  it("two classes in one month and one in the next cost 55 € + 30 € = 85 €", () => {
    const items = [
      { date: "2027-03-03", audience: "adults" },
      { date: "2027-03-10", audience: "adults" },
      { date: "2027-04-07", audience: "adults" },
    ];
    const breakdown = monthlySelectionBreakdown(items, 0);
    expect(breakdown.map((m) => [m.month, m.cents])).toEqual([
      ["2027-03", 5500],
      ["2027-04", 3000],
    ]);
  });

  it("explains that a make-up cannot be used in another month", () => {
    expect(friendlyError("MAKEUP_WRONG_MONTH")).toMatch(/mismo mes/);
  });

  it("explains that admins cannot move a booking to another month", () => {
    expect(friendlyError("CROSS_MONTH_MOVE")).toMatch(/otro mes/);
  });
});

describe("classes billed to another month", () => {
  it.each(["10:00", "17:00"])("counts Saturday 28 Nov at %s plus two December classes as three December classes for 70 €", (start_time) => {
    const items = [
      { date: "2026-11-28", start_time, billing_month: "2026-12-01", audience: "adults" },
      { date: "2026-12-02", audience: "adults" },
      { date: "2026-12-09", audience: "adults" },
    ];
    const breakdown = monthlySelectionBreakdown(items, 0);
    expect(breakdown).toEqual([{ month: "2026-12", count: 3, cents: 7000 }]);
  });

  it("counts both Saturday slots and two December classes as four December classes for 85 €", () => {
    const breakdown = monthlySelectionBreakdown([
      { date: "2026-11-28", start_time: "10:00", billing_month: "2026-12-01", audience: "adults" },
      { date: "2026-11-28", start_time: "17:00", billing_month: "2026-12-01", audience: "adults" },
      { date: "2026-12-02", audience: "adults" },
      { date: "2026-12-09", audience: "adults" },
    ], 0);
    expect(breakdown).toEqual([{ month: "2026-12", count: 4, cents: 8500 }]);
  });

  it("keeps ordinary November classes separate from Saturday billed to December", () => {
    const breakdown = monthlySelectionBreakdown([
      { date: "2026-11-26", audience: "adults" },
      { date: "2026-11-28", billing_month: "2026-12-01", audience: "adults" },
      { date: "2026-12-02", audience: "adults" },
    ], 0);
    expect(breakdown).toEqual([
      { month: "2026-11", count: 1, cents: 3000 },
      { month: "2026-12", count: 2, cents: 5500 },
    ]);
  });
});
