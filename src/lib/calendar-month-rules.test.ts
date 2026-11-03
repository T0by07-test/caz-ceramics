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
