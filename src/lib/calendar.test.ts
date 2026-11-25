import { describe, expect, it } from "vitest";
import { buildMobileMonthGrid, teacherColorVar, weekdayOf } from "./calendar";

describe("teacherColorVar", () => {
  it("is deterministic for the same teacher name", () => {
    expect(teacherColorVar("Cande")).toBe(teacherColorVar("Cande"));
  });

  it("gives different teachers different colors where possible", () => {
    const colors = new Set(["Cande", "Sofi", "Martu"].map(teacherColorVar));
    expect(colors.size).toBe(3);
  });

  it("falls back to a fixed neutral color for no teacher", () => {
    expect(teacherColorVar(null)).toBe("var(--muted-foreground)");
  });
});

describe("weekdayOf", () => {
  it("returns 0 for a Monday", () => {
    expect(weekdayOf("2026-09-07")).toBe(0);
  });

  it("returns 6 for a Sunday", () => {
    expect(weekdayOf("2026-09-06")).toBe(6);
  });
});

describe("buildMobileMonthGrid", () => {
  it("keeps Saturday 28 and Sunday 29 visible in November 2026", () => {
    const dates = buildMobileMonthGrid(new Date(2026, 10, 1)).map((cell) => cell.iso);

    expect(dates).toContain("2026-11-28");
    expect(dates).toContain("2026-11-29");
  });
});
