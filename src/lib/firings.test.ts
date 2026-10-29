import { describe, expect, it } from "vitest";
import { emptyFiringQuantities, firingTotals } from "./firings";

describe("combined biscuit and glaze firing prices", () => {
  it.each([
    ["extra_small", 150], ["small", 350], ["medium", 500], ["large", 700], ["extra_large", 1100],
  ] as const)("charges %s at %i cents for both firings", (size, price) => {
    expect(firingTotals({ ...emptyFiringQuantities(), [size]: 1 })).toEqual({ pieces: 1, cents: price });
  });
  it("adds quantities of mixed sizes without charging twice", () => {
    expect(firingTotals({ extra_small: 2, small: 3, medium: 1, large: 1, extra_large: 1 })).toEqual({ pieces: 8, cents: 3650 });
  });
  it.each([-1, 0.5, NaN])("rejects invalid quantities %s", (small) => {
    expect(() => firingTotals({ ...emptyFiringQuantities(), small })).toThrow();
  });
});