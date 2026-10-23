import { describe, expect, it } from "vitest";
import { monthlySelectionBreakdown } from "./pricing";

describe("monthly selection pricing", () => {
  it("charges two November classes at 55 euros and three December classes at 70 euros", () => {
    const rows = monthlySelectionBreakdown([
      { date: "2026-11-02" }, { date: "2026-12-02" }, { date: "2026-11-09" },
      { date: "2026-12-09" }, { date: "2026-12-16" },
    ], 0);
    expect(rows).toEqual([
      { month: "2026-11", count: 2, cents: 5500 },
      { month: "2026-12", count: 3, cents: 7000 },
    ]);
    expect(rows.reduce((sum, row) => sum + row.cents, 0)).toBe(12500);
  });
  it("does not combine three November classes and one December class into the four-class tier", () => {
    const rows = monthlySelectionBreakdown([
      { date: "2026-11-02" }, { date: "2026-11-09" }, { date: "2026-11-16" }, { date: "2026-12-02" },
    ], 0);
    expect(rows.map((r) => r.cents)).toEqual([7000, 3000]);
  });
});