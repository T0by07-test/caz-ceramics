import { describe, expect, it } from "vitest";
import { teacherColorVar, weekdayOf } from "./calendar";

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
