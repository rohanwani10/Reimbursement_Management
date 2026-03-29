import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { QUERY_HARD_LIMIT } from "./constants";
import { requireActor, requireAdmin } from "./security/auth";
import { assertCanViewApprovalChain as assertCanViewApprovalChainAccess } from "./security/access";
import { fail } from "./security/errors";

type AnyCtx = QueryCtx | MutationCtx;

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function logActivity(
  ctx: MutationCtx,
  entityType: string,
  entityId: string,
  action: string,
  actorId?: Id<"users">,
  metadata?: unknown
) {
  await ctx.db.insert("activity_logs", {
    entity_type: entityType,
    entity_id: entityId,
    action,
    actor_id: actorId,
    metadata,
    created_at: Date.now(),
  });
}

async function getExpenseInActorCompany(
  ctx: AnyCtx,
  actor: Doc<"users">,
  expenseId: Id<"expenses">
): Promise<Doc<"expenses">> {
  const expense = await ctx.db.get(expenseId);
  if (!expense) {
    fail("NOT_FOUND", "Expense not found.");
  }
  if (expense.company_id !== actor.company_id) {
    fail("FORBIDDEN", "Expense belongs to a different company.");
  }
  return expense;
}

async function getAllSteps(ctx: AnyCtx, expenseId: Id<"expenses">) {
  const steps = await ctx.db
    .query("expense_approvals")
    .withIndex("by_expense", (q) => q.eq("expense_id", expenseId))
    .take(QUERY_HARD_LIMIT);

  return steps.sort((a, b) => a.step_order - b.step_order);
}

export function getCurrentPendingOrder(
  steps: Array<Doc<"expense_approvals">>
): number | null {
  const pendingOrders = steps
    .filter((step) => step.status === "pending")
    .map((step) => step.step_order);

  if (pendingOrders.length === 0) {
    return null;
  }

  return Math.min(...pendingOrders);
}

export function assertCanViewApprovalChain(
  actor: Doc<"users">,
  expense: Doc<"expenses">,
  steps: Array<Doc<"expense_approvals">>
) {
  const isExpenseOwner = expense.user_id === actor._id;
  const isApprover = steps.some((step) => step.user_id === actor._id);

  assertCanViewApprovalChainAccess({
    actorRole: actor.role,
    isExpenseOwner,
    isApprover,
  });
}

async function skipRemainingPending(
  ctx: MutationCtx,
  expenseId: Id<"expenses">,
  comment?: string
) {
  const steps = await getAllSteps(ctx, expenseId);
  for (const step of steps) {
    if (step.status !== "pending") {
      continue;
    }
    await ctx.db.patch(step._id, {
      status: "skipped",
      comments: comment,
    });
  }
}

export const listExpenseApprovals = query({
  args: {
    expense_id: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const expense = await getExpenseInActorCompany(ctx, actor, args.expense_id);
    const steps = await getAllSteps(ctx, args.expense_id);

    assertCanViewApprovalChain(actor, expense, steps);

    const users = await ctx.db
      .query("users")
      .withIndex("by_company", (q) => q.eq("company_id", actor.company_id))
      .take(QUERY_HARD_LIMIT);
    const userNameById = new Map(users.map((user) => [String(user._id), user.name]));

    return {
      expense,
      approvals: steps.map((step) => ({
        ...step,
        approver_name: userNameById.get(String(step.user_id)),
      })),
    };
  },
});

export const approveCurrentStep = mutation({
  args: {
    expense_id: v.id("expenses"),
    comments: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const expense = await getExpenseInActorCompany(ctx, actor, args.expense_id);

    if (expense.status !== "pending") {
      fail("INVALID_STATE", "Only pending expenses can be approved.");
    }

    const steps = await getAllSteps(ctx, expense._id);
    const currentOrder = getCurrentPendingOrder(steps);
    if (currentOrder === null) {
      fail("INVALID_STATE", "Expense does not have an active pending step.");
    }

    const actorStep = steps.find(
      (step) =>
        step.step_order === currentOrder &&
        step.status === "pending" &&
        step.user_id === actor._id
    );

    if (!actorStep) {
      fail("FORBIDDEN", "Only approvers at the active step can approve.");
    }

    const comment = normalizeOptionalString(args.comments);

    await ctx.db.patch(actorStep._id, {
      status: "approved",
      comments: comment,
    });

    const updatedSteps = await getAllSteps(ctx, expense._id);
    const hasRejectedStep = updatedSteps.some((step) => step.status === "rejected");
    if (hasRejectedStep) {
      fail("INVALID_STATE", "Expense already contains a rejected approval step.");
    }

    const nextOrder = getCurrentPendingOrder(updatedSteps);

    if (nextOrder === null) {
      await ctx.db.patch(expense._id, {
        status: "approved",
        current_approver_index: undefined,
      });

      await logActivity(ctx, "expense", expense._id, "approval.completed", actor._id, {
        approved_step_order: currentOrder,
      });

      return {
        expense_id: expense._id,
        next_step_order: null,
        expense_status: "approved" as const,
      };
    }

    if (nextOrder > currentOrder) {
      await logActivity(ctx, "expense", expense._id, "approval.chain_advanced", actor._id, {
        from_order: currentOrder,
        to_order: nextOrder,
      });
    }

    await ctx.db.patch(expense._id, {
      current_approver_index: nextOrder - 1,
    });

    await logActivity(ctx, "expense_approval", actorStep._id, "approval.step_approved", actor._id, {
      expense_id: expense._id,
      order: currentOrder,
    });

    return {
      expense_id: expense._id,
      next_step_order: nextOrder,
      expense_status: "pending" as const,
    };
  },
});

export const rejectCurrentStep = mutation({
  args: {
    expense_id: v.id("expenses"),
    comments: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const expense = await getExpenseInActorCompany(ctx, actor, args.expense_id);

    if (expense.status !== "pending") {
      fail("INVALID_STATE", "Only pending expenses can be rejected.");
    }

    const steps = await getAllSteps(ctx, expense._id);
    const currentOrder = getCurrentPendingOrder(steps);
    if (currentOrder === null) {
      fail("INVALID_STATE", "Expense does not have an active pending step.");
    }

    const actorStep = steps.find(
      (step) =>
        step.step_order === currentOrder &&
        step.status === "pending" &&
        step.user_id === actor._id
    );

    if (!actorStep) {
      fail("FORBIDDEN", "Only approvers at the active step can reject.");
    }

    const comment = normalizeOptionalString(args.comments);

    await ctx.db.patch(actorStep._id, {
      status: "rejected",
      comments: comment,
    });

    await skipRemainingPending(ctx, expense._id, "Skipped after rejection");

    await ctx.db.patch(expense._id, {
      status: "rejected",
      current_approver_index: undefined,
    });

    await logActivity(ctx, "expense_approval", actorStep._id, "approval.step_rejected", actor._id, {
      expense_id: expense._id,
      order: currentOrder,
    });

    await logActivity(ctx, "expense", expense._id, "approval.rejected", actor._id, {
      rejected_step_order: currentOrder,
    });

    return {
      expense_id: expense._id,
      expense_status: "rejected" as const,
    };
  },
});

async function adminOverride(
  ctx: MutationCtx,
  expenseId: Id<"expenses">,
  status: "approved" | "rejected",
  reason: string,
  admin: Doc<"users">
) {
  const expense = await getExpenseInActorCompany(ctx, admin, expenseId);

  if (expense.status === status) {
    return {
      expense_id: expense._id,
      status,
      changed: false,
    };
  }

  if (expense.status === "approved" || expense.status === "rejected") {
    fail("INVALID_STATE", "Finalized expenses cannot be overridden to another final state.");
  }

  await skipRemainingPending(ctx, expense._id, `Admin override: ${reason}`);

  await ctx.db.patch(expense._id, {
    status,
    current_approver_index: undefined,
  });

  await logActivity(
    ctx,
    "expense",
    expense._id,
    status === "approved" ? "approval.admin_override_approved" : "approval.admin_override_rejected",
    admin._id,
    { reason }
  );

  return {
    expense_id: expense._id,
    status,
    changed: true,
  };
}

export const adminApproveOverride = mutation({
  args: {
    expense_id: v.id("expenses"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reason = args.reason.trim();
    if (!reason) {
      fail("VALIDATION_ERROR", "Override reason is required.");
    }

    return await adminOverride(ctx, args.expense_id, "approved", reason, admin);
  },
});

export const adminRejectOverride = mutation({
  args: {
    expense_id: v.id("expenses"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const reason = args.reason.trim();
    if (!reason) {
      fail("VALIDATION_ERROR", "Override reason is required.");
    }

    return await adminOverride(ctx, args.expense_id, "rejected", reason, admin);
  },
});
