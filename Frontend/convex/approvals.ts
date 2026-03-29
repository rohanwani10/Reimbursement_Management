import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { QUERY_HARD_LIMIT } from "./constants";
import { requireAuth } from "./lib/auth";
import { logActivity } from "./lib/activity";
import { enqueueNotification } from "./lib/notifications";
import { assertOrFail, fail } from "./lib/errors";
import { requireRole, requireSameCompany } from "./lib/rbac";

async function getExpenseOrFail(ctx: MutationCtx, expenseId: Id<"expenses">) {
  const expense = await ctx.db.get(expenseId);
  assertOrFail(expense, "NOT_FOUND", "Expense not found.");
  return expense;
}

async function getAllSteps(ctx: MutationCtx, expenseId: Id<"expenses">) {
  const steps = await ctx.db
    .query("expenseApprovals")
    .withIndex("by_expenseId_and_order", (q) => q.eq("expenseId", expenseId))
    .take(QUERY_HARD_LIMIT);

  return steps.sort((a, b) => a.order - b.order);
}

async function getCurrentStepOrFail(
  ctx: MutationCtx,
  expenseId: Id<"expenses">,
  currentOrder: number | null,
) {
  if (currentOrder === null) {
    fail("INVALID_STATE", "Expense does not have an active approval step.");
  }

  const currentStep = await ctx.db
    .query("expenseApprovals")
    .withIndex("by_expenseId_and_order", (q) =>
      q.eq("expenseId", expenseId).eq("order", currentOrder),
    )
    .unique();

  assertOrFail(currentStep, "INVALID_STATE", "Current approval step is missing.");

  if (currentStep.status !== "pending") {
    fail("INVALID_STATE", "Current approval step is no longer pending.");
  }

  return currentStep;
}

async function markRemainingPendingAsSkipped(
  ctx: MutationCtx,
  expenseId: Id<"expenses">,
  actorId: Id<"users">,
  fromOrderExclusive: number,
  now: number,
) {
  const steps = await getAllSteps(ctx, expenseId);
  for (const step of steps) {
    if (step.order <= fromOrderExclusive) {
      continue;
    }
    if (step.status !== "pending") {
      continue;
    }
    await ctx.db.patch(step._id, {
      status: "skipped",
      comment: step.comment,
      actedAt: now,
      decidedById: actorId,
      updatedAt: now,
    });
  }
}

export const listExpenseApprovals = query({
  args: {
    expenseId: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    const expense = await ctx.db.get(args.expenseId);
    assertOrFail(expense, "NOT_FOUND", "Expense not found.");
    requireSameCompany(expense.companyId, actor.company._id);

    const steps = await ctx.db
      .query("expenseApprovals")
      .withIndex("by_expenseId_and_order", (q) => q.eq("expenseId", args.expenseId))
      .take(QUERY_HARD_LIMIT);

    if (actor.user.role !== "admin" && expense.employeeId !== actor.user._id) {
      const isApprover = steps.some((step) => step.approverId === actor.user._id);
      if (!isApprover && actor.user.role !== "manager") {
        fail("FORBIDDEN", "You are not allowed to view this approval chain.");
      }
    }

    return steps.sort((a, b) => a.order - b.order);
  },
});

export const approveCurrentStep = mutation({
  args: {
    expenseId: v.id("expenses"),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    const expense = await getExpenseOrFail(ctx, args.expenseId);
    requireSameCompany(expense.companyId, actor.company._id);

    if (expense.status !== "pending") {
      fail("INVALID_STATE", "Only pending expenses can be approved.");
    }

    const currentStep = await getCurrentStepOrFail(
      ctx,
      expense._id,
      expense.currentApprovalOrder,
    );

    if (currentStep.approverId !== actor.user._id) {
      fail("FORBIDDEN", "Only the currently assigned approver can act.");
    }

    const now = Date.now();
    await ctx.db.patch(currentStep._id, {
      status: "approved",
      comment: args.comment?.trim() ?? null,
      actedAt: now,
      decidedById: actor.user._id,
      updatedAt: now,
    });

    const allSteps = await getAllSteps(ctx, expense._id);
    const nextStep = allSteps.find(
      (step) => step.order > currentStep.order && step.status === "pending",
    );

    if (nextStep) {
      await ctx.db.patch(expense._id, {
        currentApprovalOrder: nextStep.order,
        updatedAt: now,
      });

      await logActivity(ctx, {
        companyId: actor.company._id,
        actorId: actor.user._id,
        entityType: "expense",
        entityId: expense._id,
        action: "approval.chain_advanced",
        metadata: {
          fromOrder: currentStep.order,
          toOrder: nextStep.order,
        },
        createdAt: now,
      });

      await enqueueNotification(ctx, {
        companyId: actor.company._id,
        userId: nextStep.approverId,
        type: "approval.assigned",
        title: "Expense approval required",
        message: "A submitted expense advanced to your approval step.",
        payload: {
          expenseId: expense._id,
          order: nextStep.order,
        },
      });
    } else {
      await ctx.db.patch(expense._id, {
        status: "approved",
        currentApprovalOrder: null,
        updatedAt: now,
      });

      await logActivity(ctx, {
        companyId: actor.company._id,
        actorId: actor.user._id,
        entityType: "expense",
        entityId: expense._id,
        action: "approval.completed",
        metadata: null,
        createdAt: now,
      });

      await enqueueNotification(ctx, {
        companyId: actor.company._id,
        userId: expense.employeeId,
        type: "expense.approved",
        title: "Expense approved",
        message: "Your expense was fully approved.",
        payload: {
          expenseId: expense._id,
        },
      });
    }

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "expenseApproval",
      entityId: currentStep._id,
      action: "approval.step_approved",
      metadata: {
        expenseId: expense._id,
        order: currentStep.order,
      },
      createdAt: now,
    });

    return {
      expenseId: expense._id,
      nextOrder: nextStep?.order ?? null,
      expenseStatus: nextStep ? "pending" : "approved",
    };
  },
});

export const rejectCurrentStep = mutation({
  args: {
    expenseId: v.id("expenses"),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    const expense = await getExpenseOrFail(ctx, args.expenseId);
    requireSameCompany(expense.companyId, actor.company._id);

    if (expense.status !== "pending") {
      fail("INVALID_STATE", "Only pending expenses can be rejected.");
    }

    const currentStep = await getCurrentStepOrFail(
      ctx,
      expense._id,
      expense.currentApprovalOrder,
    );

    if (currentStep.approverId !== actor.user._id) {
      fail("FORBIDDEN", "Only the currently assigned approver can act.");
    }

    const now = Date.now();
    await ctx.db.patch(currentStep._id, {
      status: "rejected",
      comment: args.comment?.trim() ?? null,
      actedAt: now,
      decidedById: actor.user._id,
      updatedAt: now,
    });

    await markRemainingPendingAsSkipped(
      ctx,
      expense._id,
      actor.user._id,
      currentStep.order,
      now,
    );

    await ctx.db.patch(expense._id, {
      status: "rejected",
      currentApprovalOrder: null,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "expenseApproval",
      entityId: currentStep._id,
      action: "approval.step_rejected",
      metadata: {
        expenseId: expense._id,
        order: currentStep.order,
      },
      createdAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "expense",
      entityId: expense._id,
      action: "approval.rejected",
      metadata: {
        order: currentStep.order,
      },
      createdAt: now,
    });

    await enqueueNotification(ctx, {
      companyId: actor.company._id,
      userId: expense.employeeId,
      type: "expense.rejected",
      title: "Expense rejected",
      message: "Your submitted expense was rejected.",
      payload: {
        expenseId: expense._id,
        order: currentStep.order,
      },
    });

    return {
      expenseId: expense._id,
      expenseStatus: "rejected",
    };
  },
});

async function adminOverride(
  ctx: MutationCtx,
  expenseId: Id<"expenses">,
  actorId: Id<"users">,
  companyId: Id<"companies">,
  status: "approved" | "rejected",
  reason: string,
) {
  const expense = await getExpenseOrFail(ctx, expenseId);
  requireSameCompany(expense.companyId, companyId);

  if (expense.status === status) {
    return {
      expenseId: expense._id,
      status,
      changed: false,
    };
  }

  if (expense.status === "approved" || expense.status === "rejected") {
    fail("INVALID_STATE", "Finalized expenses cannot be overridden to another final state.");
  }

  const now = Date.now();
  const allSteps = await getAllSteps(ctx, expense._id);
  for (const step of allSteps) {
    if (step.status !== "pending") {
      continue;
    }
    await ctx.db.patch(step._id, {
      status: "skipped",
      actedAt: now,
      decidedById: actorId,
      updatedAt: now,
    });
  }

  await ctx.db.patch(expense._id, {
    status,
    currentApprovalOrder: null,
    updatedAt: now,
  });

  await logActivity(ctx, {
    companyId,
    actorId,
    entityType: "expense",
    entityId: expense._id,
    action:
      status === "approved"
        ? "approval.admin_override_approved"
        : "approval.admin_override_rejected",
    metadata: {
      reason,
    },
    createdAt: now,
  });

  await enqueueNotification(ctx, {
    companyId,
    userId: expense.employeeId,
    type: "approval.admin_override",
    title: "Expense overridden by admin",
    message:
      status === "approved"
        ? "An admin approved your expense by override."
        : "An admin rejected your expense by override.",
    payload: {
      expenseId: expense._id,
      status,
      reason,
    },
  });

  return {
    expenseId: expense._id,
    status,
    changed: true,
  };
}

export const adminApproveOverride = mutation({
  args: {
    expenseId: v.id("expenses"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const reason = args.reason.trim();
    if (!reason) {
      fail("VALIDATION_ERROR", "Override reason is required.");
    }

    return await adminOverride(
      ctx,
      args.expenseId,
      actor.user._id,
      actor.company._id,
      "approved",
      reason,
    );
  },
});

export const adminRejectOverride = mutation({
  args: {
    expenseId: v.id("expenses"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const reason = args.reason.trim();
    if (!reason) {
      fail("VALIDATION_ERROR", "Override reason is required.");
    }

    return await adminOverride(
      ctx,
      args.expenseId,
      actor.user._id,
      actor.company._id,
      "rejected",
      reason,
    );
  },
});
