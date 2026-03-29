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
import { resolveRuleAndApprovers } from "./ruleEngine";

const DEFAULT_LIST_LIMIT = 50;

function safeLimit(input: number | undefined) {
  const requested = input ?? DEFAULT_LIST_LIMIT;
  return Math.max(1, Math.min(requested, QUERY_HARD_LIMIT));
}

function normalizeNullableString(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeStringForInsert(value: string | undefined) {
  return normalizeNullableString(value) ?? null;
}

async function getExpenseOrFail(
  ctx: MutationCtx,
  expenseId: Id<"expenses">,
) {
  const expense = await ctx.db.get(expenseId);
  assertOrFail(expense, "NOT_FOUND", "Expense not found.");
  return expense;
}

function canMutateExpenseDraft(actorRole: string, actorId: string, expenseEmployeeId: string) {
  if (actorRole === "admin") {
    return true;
  }
  return actorId === expenseEmployeeId;
}

export const createDraft = mutation({
  args: {
    amount: v.optional(v.number()),
    currencyCode: v.optional(v.string()),
    normalizedAmount: v.optional(v.number()),
    normalizedCurrencyCode: v.optional(v.string()),
    exchangeRate: v.optional(v.number()),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    expenseDate: v.optional(v.string()),
    receiptRefs: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    const now = Date.now();

    const expenseId = await ctx.db.insert("expenses", {
      companyId: actor.company._id,
      employeeId: actor.user._id,
      amount: args.amount ?? null,
      currencyCode: args.currencyCode?.trim().toUpperCase() ?? null,
      normalizedAmount: args.normalizedAmount ?? null,
      normalizedCurrencyCode: args.normalizedCurrencyCode?.trim().toUpperCase() ?? null,
      exchangeRate: args.exchangeRate ?? null,
      category: normalizeStringForInsert(args.category),
      description: normalizeStringForInsert(args.description),
      expenseDate: normalizeStringForInsert(args.expenseDate),
      receiptRefs: args.receiptRefs ?? [],
      ocrRequestId: null,
      status: "draft",
      matchedRuleId: null,
      approvalMode: null,
      submittedAt: null,
      currentApprovalOrder: null,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "expense",
      entityId: expenseId,
      action: "expense.draft_created",
      metadata: null,
      createdAt: now,
    });

    return { expenseId };
  },
});

export const updateDraft = mutation({
  args: {
    expenseId: v.id("expenses"),
    amount: v.optional(v.number()),
    currencyCode: v.optional(v.string()),
    normalizedAmount: v.optional(v.number()),
    normalizedCurrencyCode: v.optional(v.string()),
    exchangeRate: v.optional(v.number()),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    expenseDate: v.optional(v.string()),
    receiptRefs: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    const expense = await getExpenseOrFail(ctx, args.expenseId);
    requireSameCompany(expense.companyId, actor.company._id);

    if (!canMutateExpenseDraft(actor.user.role, actor.user._id, expense.employeeId)) {
      fail("FORBIDDEN", "You are not allowed to edit this draft.");
    }

    if (expense.status !== "draft") {
      fail("INVALID_STATE", "Only draft expenses can be edited.");
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.amount !== undefined) patch.amount = args.amount;
    if (args.currencyCode !== undefined) patch.currencyCode = args.currencyCode.trim().toUpperCase();
    if (args.normalizedAmount !== undefined) patch.normalizedAmount = args.normalizedAmount;
    if (args.normalizedCurrencyCode !== undefined) {
      patch.normalizedCurrencyCode = args.normalizedCurrencyCode.trim().toUpperCase();
    }
    if (args.exchangeRate !== undefined) patch.exchangeRate = args.exchangeRate;
    if (args.category !== undefined) patch.category = normalizeNullableString(args.category);
    if (args.description !== undefined) patch.description = normalizeNullableString(args.description);
    if (args.expenseDate !== undefined) patch.expenseDate = normalizeNullableString(args.expenseDate);
    if (args.receiptRefs !== undefined) patch.receiptRefs = args.receiptRefs;

    await ctx.db.patch(expense._id, patch);

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "expense",
      entityId: expense._id,
      action: "expense.draft_updated",
      metadata: null,
    });

    return { expenseId: expense._id };
  },
});

export const deleteDraft = mutation({
  args: {
    expenseId: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    const expense = await getExpenseOrFail(ctx, args.expenseId);
    requireSameCompany(expense.companyId, actor.company._id);

    if (!canMutateExpenseDraft(actor.user.role, actor.user._id, expense.employeeId)) {
      fail("FORBIDDEN", "You are not allowed to delete this draft.");
    }

    if (expense.status !== "draft") {
      fail("INVALID_STATE", "Only draft expenses can be deleted.");
    }

    await ctx.db.delete(expense._id);

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "expense",
      entityId: expense._id,
      action: "expense.draft_deleted",
      metadata: null,
    });

    return { deleted: true };
  },
});

export const submitExpense = mutation({
  args: {
    expenseId: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    const expense = await getExpenseOrFail(ctx, args.expenseId);
    requireSameCompany(expense.companyId, actor.company._id);

    if (!canMutateExpenseDraft(actor.user.role, actor.user._id, expense.employeeId)) {
      fail("FORBIDDEN", "You are not allowed to submit this expense.");
    }
    if (expense.status !== "draft") {
      fail("INVALID_STATE", "Only draft expenses can be submitted.");
    }

    if (
      expense.amount === null ||
      expense.currencyCode === null ||
      expense.category === null ||
      expense.expenseDate === null
    ) {
      fail("VALIDATION_ERROR", "Amount, currencyCode, category, and expenseDate are required.");
    }

    let normalizedAmount = expense.normalizedAmount;
    let normalizedCurrencyCode = expense.normalizedCurrencyCode;
    let exchangeRate = expense.exchangeRate;

    if (
      normalizedAmount === null ||
      normalizedCurrencyCode === null ||
      exchangeRate === null
    ) {
      if (expense.currencyCode === actor.company.currencyCode) {
        normalizedAmount = expense.amount;
        normalizedCurrencyCode = expense.currencyCode;
        exchangeRate = 1;
      } else {
        fail(
          "VALIDATION_ERROR",
          "normalizedAmount, normalizedCurrencyCode, and exchangeRate are required for non-base currency expenses.",
        );
      }
    }

    const resolution = await resolveRuleAndApprovers(ctx, {
      companyId: actor.company._id,
      employeeId: expense.employeeId,
      category: expense.category,
      normalizedAmount,
    });

    if (resolution.approverIds.length === 0) {
      fail("INVALID_STATE", "Expense cannot be submitted without an approval chain.");
    }

    const now = Date.now();
    for (const [order, approverId] of resolution.approverIds.entries()) {
      await ctx.db.insert("expenseApprovals", {
        companyId: actor.company._id,
        expenseId: expense._id,
        approverId,
        order,
        status: "pending",
        comment: null,
        actedAt: null,
        decidedById: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(expense._id, {
      normalizedAmount,
      normalizedCurrencyCode,
      exchangeRate,
      status: "pending",
      matchedRuleId: resolution.ruleId,
      approvalMode: resolution.mode,
      submittedAt: now,
      currentApprovalOrder: 0,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "expense",
      entityId: expense._id,
      action: "expense.submitted",
      metadata: {
        matchedRuleId: resolution.ruleId,
        approverCount: resolution.approverIds.length,
        usedAdminFallback: resolution.usedAdminFallback,
      },
      createdAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "expense",
      entityId: expense._id,
      action: "expense.locked",
      metadata: null,
      createdAt: now,
    });

    await enqueueNotification(ctx, {
      companyId: actor.company._id,
      userId: resolution.approverIds[0],
      type: "approval.assigned",
      title: "Expense approval required",
      message: "A submitted expense is waiting for your review.",
      payload: {
        expenseId: expense._id,
        order: 0,
      },
    });

    return {
      expenseId: expense._id,
      matchedRuleId: resolution.ruleId,
      firstApproverId: resolution.approverIds[0],
      usedAdminFallback: resolution.usedAdminFallback,
    };
  },
});

export const getExpense = query({
  args: {
    expenseId: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    const expense = await ctx.db.get(args.expenseId);
    assertOrFail(expense, "NOT_FOUND", "Expense not found.");
    requireSameCompany(expense.companyId, actor.company._id);

    const isAdmin = actor.user.role === "admin";
    const isOwner = expense.employeeId === actor.user._id;
    let isManagerContext = false;

    if (!isAdmin && !isOwner && actor.user.role === "manager") {
      const assignment = await ctx.db
        .query("expenseApprovals")
        .withIndex("by_expenseId", (q) => q.eq("expenseId", expense._id))
        .take(QUERY_HARD_LIMIT);
      isManagerContext = assignment.some((entry) => entry.approverId === actor.user._id);

      if (!isManagerContext) {
        const submitter = await ctx.db.get(expense.employeeId);
        isManagerContext = submitter?.managerId === actor.user._id;
      }
    }

    if (!isAdmin && !isOwner && !isManagerContext) {
      fail("FORBIDDEN", "You are not allowed to view this expense.");
    }

    const approvals = await ctx.db
      .query("expenseApprovals")
      .withIndex("by_expenseId_and_order", (q) => q.eq("expenseId", expense._id))
      .take(QUERY_HARD_LIMIT);

    return {
      expense,
      approvals,
    };
  },
});

export const listOwnExpenses = query({
  args: {
    status: v.optional(v.union(v.literal("draft"), v.literal("pending"), v.literal("approved"), v.literal("rejected"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    const limit = safeLimit(args.limit);

    const rows = await ctx.db
      .query("expenses")
      .withIndex("by_employeeId", (q) => q.eq("employeeId", actor.user._id))
      .order("desc")
      .take(limit * 3);

    return rows
      .filter((row) => row.companyId === actor.company._id)
      .filter((row) => (args.status ? row.status === args.status : true))
      .slice(0, limit);
  },
});

export const listManagerQueue = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ["manager", "admin"]);
    const limit = safeLimit(args.limit);

    const pendingAssignments = await ctx.db
      .query("expenseApprovals")
      .withIndex("by_approverId_and_status", (q) =>
        q.eq("approverId", actor.user._id).eq("status", "pending"),
      )
      .order("desc")
      .take(limit * 4);

    const queue = [];
    for (const assignment of pendingAssignments) {
      const expense = await ctx.db.get(assignment.expenseId);
      if (!expense || expense.companyId !== actor.company._id) {
        continue;
      }
      if (expense.status !== "pending") {
        continue;
      }
      if (expense.currentApprovalOrder !== assignment.order) {
        continue;
      }
      queue.push({
        expense,
        assignment,
      });
      if (queue.length >= limit) {
        break;
      }
    }

    return queue;
  },
});

export const listCompanyExpenses = query({
  args: {
    status: v.optional(v.union(v.literal("draft"), v.literal("pending"), v.literal("approved"), v.literal("rejected"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const limit = safeLimit(args.limit);

    if (args.status) {
      return await ctx.db
        .query("expenses")
        .withIndex("by_companyId_and_status", (q) =>
          q.eq("companyId", actor.company._id).eq("status", args.status!),
        )
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("expenses")
      .withIndex("by_companyId", (q) => q.eq("companyId", actor.company._id))
      .order("desc")
      .take(limit);
  },
});
