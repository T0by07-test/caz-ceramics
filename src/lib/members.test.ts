import { describe, expect, it } from "vitest";
import { summarizeMonthClasses } from "./members";

describe("summarizeMonthClasses", () => {
  it("returns one chip per distinct date, sorted ascending", () => {
    const result = summarizeMonthClasses([
      { date: "2026-09-09", weekday: 2 },
      { date: "2026-09-02", weekday: 2 },
      { date: "2026-09-16", weekday: 2 },
    ]);
    expect(result.count).toBe(3);
    expect(result.chips.map((c) => c.date)).toEqual(["2026-09-02", "2026-09-09", "2026-09-16"]);
  });

  it("dedupes bookings that land on the same date", () => {
    const result = summarizeMonthClasses([
      { date: "2026-09-02", weekday: 2 },
      { date: "2026-09-02", weekday: 2 },
    ]);
    expect(result.count).toBe(1);
  });

  it("returns an empty summary for no classes", () => {
    const result = summarizeMonthClasses([]);
    expect(result.count).toBe(0);
    expect(result.chips).toEqual([]);
    expect(result.tooltip).toBe("");
  });

  it("builds a human-readable tooltip using short weekday + day-of-month", () => {
    const result = summarizeMonthClasses([{ date: "2026-09-07", weekday: 0 }]);
    expect(result.tooltip).toBe("Lun 7");
  });
});
