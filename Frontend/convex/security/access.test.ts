import { describe, expect, it } from "vitest";

import { canMutateDraftExpense, canViewApprovalChain } from "./access";

describe("canViewApprovalChain", () => {
  it("allows admins", () => {
    expect(
      canViewApprovalChain({
        actorRole: "admin",
        isExpenseOwner: false,
        isApprover: false,
      })
    ).toBe(true);
  });

  it("allows expense owners", () => {
    expect(
      canViewApprovalChain({
        actorRole: "employee",
        isExpenseOwner: true,
        isApprover: false,
      })
    ).toBe(true);
  });

  it("allows assigned approvers", () => {
    expect(
      canViewApprovalChain({
        actorRole: "manager",
        isExpenseOwner: false,
        isApprover: true,
      })
    ).toBe(true);
  });

  it("rejects unrelated managers", () => {
    expect(
      canViewApprovalChain({
        actorRole: "manager",
        isExpenseOwner: false,
        isApprover: false,
      })
    ).toBe(false);
  });
});

describe("canMutateDraftExpense", () => {
  it("allows owner on draft", () => {
    expect(
      canMutateDraftExpense({
        actorId: "u1",
        ownerId: "u1",
        status: "draft",
      })
    ).toBe(true);
  });

  it("rejects non-owner", () => {
    expect(
      canMutateDraftExpense({
        actorId: "u2",
        ownerId: "u1",
        status: "draft",
      })
    ).toBe(false);
  });

  it("rejects owner when not draft", () => {
    expect(
      canMutateDraftExpense({
        actorId: "u1",
        ownerId: "u1",
        status: "pending",
      })
    ).toBe(false);
  });
});
