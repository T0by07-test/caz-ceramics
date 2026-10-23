import { describe, expect, it } from "vitest";
import { monthlyPriceCents, monthlySelectionBreakdown } from "./pricing";

describe("monthly selection pricing", () => {
  it("charges only 20 euros for the fifth class after paying 85 euros for four", () => {
    expect(monthlyPriceCents(4)).toBe(8500);
    expect(monthlyPriceCents(5) - monthlyPriceCents(4)).toBe(2000);
  });
  it("charges only 15 euros for the third class after paying 55 euros for two", () => {
    expect(monthlyPriceCents(2)).toBe(5500);
    expect(monthlyPriceCents(3) - monthlyPriceCents(2)).toBe(1500);
  });
  it("charges only 15 euros for the fourth class after paying 70 euros for three", () => {
    expect(monthlyPriceCents(3)).toBe(7000);
    expect(monthlyPriceCents(4) - monthlyPriceCents(3)).toBe(1500);
  });
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