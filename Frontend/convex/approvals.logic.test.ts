import { describe, expect, it } from "vitest";

import { getCurrentPendingOrder } from "./approvals";

type StepLike = {
  step_order: number;
  status: "pending" | "approved" | "rejected" | "skipped";
};

describe("getCurrentPendingOrder", () => {
  it("returns smallest pending step order", () => {
    const steps = [
      { step_order: 3, status: "pending" },
      { step_order: 1, status: "approved" },
      { step_order: 2, status: "pending" },
    ] as StepLike[];

    expect(getCurrentPendingOrder(steps as unknown as Parameters<typeof getCurrentPendingOrder>[0])).toBe(2);
  });

  it("returns null when nothing is pending", () => {
    const steps = [
      { step_order: 1, status: "approved" },
      { step_order: 2, status: "rejected" },
    ] as StepLike[];

    expect(getCurrentPendingOrder(steps as unknown as Parameters<typeof getCurrentPendingOrder>[0])).toBeNull();
  });
});
