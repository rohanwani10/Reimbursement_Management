import { describe, expect, it } from "vitest";

import { compareRules } from "./ruleEngine";

function rule(overrides: Record<string, unknown>) {
  return {
    _id: "r1",
    category: undefined,
    amount_threshold: undefined,
    priority: 1,
    ...overrides,
  } as unknown as Parameters<typeof compareRules>[0];
}

describe("compareRules", () => {
  it("prefers exact category over wildcard", () => {
    const exact = rule({ _id: "r-exact", category: "Meals" });
    const wildcard = rule({ _id: "r-any", category: undefined });
    expect(compareRules(exact, wildcard, "Meals")).toBeLessThan(0);
  });

  it("prefers higher matching threshold", () => {
    const low = rule({ _id: "r-low", amount_threshold: 100 });
    const high = rule({ _id: "r-high", amount_threshold: 500 });
    expect(compareRules(high, low, "Travel")).toBeLessThan(0);
  });

  it("prefers higher priority when specificity and threshold are equal", () => {
    const p1 = rule({ _id: "r-p1", priority: 1 });
    const p2 = rule({ _id: "r-p2", priority: 2 });
    expect(compareRules(p2, p1, "Travel")).toBeLessThan(0);
  });
});
