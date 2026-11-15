import { describe, expect, it } from "vitest";
import { isInAdminWorkshopList } from "./workshops";

describe("admin workshop list", () => {
  it("includes every workshop through 19 December 2026", () => {
    expect(isInAdminWorkshopList("2026-12-16")).toBe(true);
    expect(isInAdminWorkshopList("2026-12-19")).toBe(true);
  });

  it("excludes workshops after 19 December 2026", () => {
    expect(isInAdminWorkshopList("2026-12-20")).toBe(false);
  });
});
