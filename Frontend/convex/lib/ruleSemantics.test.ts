import { describe, expect, it } from "vitest";

import { isSupportedRuleSemantics } from "./ruleSemantics";

describe("isSupportedRuleSemantics", () => {
  it("accepts sequential all", () => {
    expect(isSupportedRuleSemantics("sequential", "all")).toBe(true);
  });

  it("rejects parallel mode", () => {
    expect(isSupportedRuleSemantics("parallel", "all")).toBe(false);
  });

  it("rejects percentage condition", () => {
    expect(isSupportedRuleSemantics("sequential", "percentage")).toBe(false);
  });

  it("rejects specific condition", () => {
    expect(isSupportedRuleSemantics("sequential", "specific")).toBe(false);
  });

  it("rejects hybrid condition", () => {
    expect(isSupportedRuleSemantics("sequential", "hybrid")).toBe(false);
  });
});
