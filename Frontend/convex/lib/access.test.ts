import { describe, expect, it } from "vitest";

import { canViewApprovalChain } from "./access";

describe("canViewApprovalChain", () => {
  it("allows admins", () => {
    expect(
      canViewApprovalChain({
        actorRole: "admin",
        isExpenseOwner: false,
        isApprover: false,
      }),
    ).toBe(true);
  });

  it("allows expense owners", () => {
    expect(
      canViewApprovalChain({
        actorRole: "employee",
        isExpenseOwner: true,
        isApprover: false,
      }),
    ).toBe(true);
  });

  it("allows assigned approvers", () => {
    expect(
      canViewApprovalChain({
        actorRole: "manager",
        isExpenseOwner: false,
        isApprover: true,
      }),
    ).toBe(true);
  });

  it("rejects unrelated managers", () => {
    expect(
      canViewApprovalChain({
        actorRole: "manager",
        isExpenseOwner: false,
        isApprover: false,
      }),
    ).toBe(false);
  });
});
