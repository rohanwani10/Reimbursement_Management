import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireActor, requireAdminRole } from "./security/auth";
import { fail } from "./security/errors";

type ExpenseStatus = "draft" | "pending" | "approved" | "rejected";

type DraftExpenseUpdates = {
  amount?: number;
  currency?: string;
  category?: string;
  description?: string;
  expense_date?: string;
  paid_by?: string;
  remarks?: string;
  receipt_url?: string;
};

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

function normalizeRequiredString(raw: string, field: string): string {
  const value = raw.trim();
  if (!value) {
    fail("VALIDATION_ERROR", `${field} is required.`);
  }
  return value;
}

function normalizeOptionalString(raw?: string): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}

function validatePositiveAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    fail("VALIDATION_ERROR", "Amount must be greater than zero.");
  }
  return amount;
}

function selectMatchingRule(
  rules: Doc<"approval_rules">[],
  category: string,
  amount: number
): Doc<"approval_rules"> | undefined {
  return rules
    .filter((rule) => {
      const matchesCategory = rule.category ? rule.category === category : true;
      const matchesThreshold =
        rule.amount_threshold !== undefined ? amount >= rule.amount_threshold : true;
      return matchesCategory && matchesThreshold;
    })
    .sort((a, b) => b.priority - a.priority)[0];
}

async function clearApprovalsForExpense(
  ctx: MutationCtx,
  expenseId: Id<"expenses">
): Promise<void> {
  const approvals = await ctx.db
    .query("expense_approvals")
    .withIndex("by_expense", (q) => q.eq("expense_id", expenseId))
    .collect();

  for (const approval of approvals) {
    await ctx.db.delete(approval._id);
  }
}

async function generateApprovalChain(
  ctx: MutationCtx,
  expenseId: Id<"expenses">,
  submitter: Doc<"users">,
  companyId: Id<"companies">,
  category: string,
  amount: number
): Promise<void> {
  const rules = await ctx.db
    .query("approval_rules")
    .withIndex("by_company", (q) => q.eq("company_id", companyId))
    .collect();

  const matchingRule = selectMatchingRule(rules, category, amount);
  if (!matchingRule) {
    await logActivity(ctx, "expense", expenseId, "no_rule_found", submitter._id);
    return;
  }

  const ruleApprovers = await ctx.db
    .query("rule_approvers")
    .withIndex("by_rule", (q) => q.eq("rule_id", matchingRule._id))
    .collect();

  const approversByUser = new Map<
    string,
    { user_id: Id<"users">; status: "pending"; step_order: number }
  >();

  let currentStepOrder = 1;

  if (matchingRule.manager_injection && submitter.manager_id) {
    const manager = await ctx.db.get(submitter.manager_id);
    if (!manager) {
      fail("INVALID_STATE", "Submitter manager record is missing.");
    }
    if (manager.company_id !== companyId) {
      fail("INVALID_STATE", "Submitter manager belongs to another company.");
    }
    if (manager.role === "employee") {
      fail("INVALID_STATE", "Submitter manager cannot be an employee approver.");
    }

    approversByUser.set(String(manager._id), {
      user_id: manager._id,
      status: "pending",
      step_order: currentStepOrder++,
    });
  }

  const sortedApprovers = [...ruleApprovers].sort(
    (a, b) => a.sequence_order - b.sequence_order
  );

  for (const approver of sortedApprovers) {
    const approverUser = await ctx.db.get(approver.user_id);
    if (!approverUser) {
      fail("INVALID_STATE", "Rule approver record is missing.");
    }
    if (approverUser.company_id !== companyId) {
      fail("INVALID_STATE", "Rule approver belongs to another company.");
    }
    if (approverUser.role === "employee") {
      fail("INVALID_STATE", "Rule approver must have manager or admin role.");
    }

    const approverKey = String(approverUser._id);
    if (!approversByUser.has(approverKey)) {
      approversByUser.set(approverKey, {
        user_id: approverUser._id,
        status: "pending",
        step_order:
          matchingRule.approval_mode === "sequential" ? currentStepOrder++ : 1,
      });
    }
  }

  const approvers = Array.from(approversByUser.values());
  for (const approver of approvers) {
    await ctx.db.insert("expense_approvals", {
      expense_id: expenseId,
      user_id: approver.user_id,
      status: approver.status,
      step_order: approver.step_order,
    });
  }

  await logActivity(ctx, "expense", expenseId, "approval_chain_generated", submitter._id, {
    rule_id: matchingRule._id,
    approvers_count: approvers.length,
  });
}

async function getExpenseInActorCompany(
  ctx: QueryCtx | MutationCtx,
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

function assertExpenseOwner(actor: Doc<"users">, expense: Doc<"expenses">): void {
  if (expense.user_id !== actor._id) {
    fail("FORBIDDEN", "You can only modify your own expenses.");
  }
}

function buildDraftPatch(updates: DraftExpenseUpdates): DraftExpenseUpdates {
  const patch: DraftExpenseUpdates = {};

  if (updates.amount !== undefined) {
    patch.amount = validatePositiveAmount(updates.amount);
  }

  if (updates.currency !== undefined) {
    patch.currency = normalizeRequiredString(updates.currency, "Currency");
  }

  if (updates.category !== undefined) {
    patch.category = normalizeRequiredString(updates.category, "Category");
  }

  if (updates.description !== undefined) {
    patch.description = normalizeOptionalString(updates.description);
  }

  if (updates.expense_date !== undefined) {
    patch.expense_date = normalizeOptionalString(updates.expense_date);
  }

  if (updates.paid_by !== undefined) {
    patch.paid_by = normalizeOptionalString(updates.paid_by);
  }

  if (updates.remarks !== undefined) {
    patch.remarks = normalizeOptionalString(updates.remarks);
  }

  if (updates.receipt_url !== undefined) {
    patch.receipt_url = normalizeOptionalString(updates.receipt_url);
  }

  return patch;
}

export const submitExpense = mutation({
  args: {
    amount: v.number(),
    currency: v.string(),
    category: v.string(),
    receipt_url: v.optional(v.string()),
    ocr_data: v.optional(
      v.object({
        extracted: v.any(),
        raw: v.any(),
        confidence: v.number(),
      })
    ),
    description: v.optional(v.string()),
    expense_date: v.optional(v.string()),
    paid_by: v.optional(v.string()),
    remarks: v.optional(v.string()),
    base_currency: v.optional(v.string()),
    converted_amount: v.optional(v.number()),
    exchange_rate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);

    const amount = validatePositiveAmount(args.amount);
    const currency = normalizeRequiredString(args.currency, "Currency");
    const category = normalizeRequiredString(args.category, "Category");

    const expenseId = await ctx.db.insert("expenses", {
      company_id: actor.company_id,
      user_id: actor._id,
      amount,
      currency,
      category,
      description: normalizeOptionalString(args.description),
      expense_date: normalizeOptionalString(args.expense_date),
      paid_by: normalizeOptionalString(args.paid_by),
      remarks: normalizeOptionalString(args.remarks),
      receipt_url: normalizeOptionalString(args.receipt_url),
      ocr_data: args.ocr_data,
      status: "pending",
      submitted_at: Date.now(),
      current_approver_index: 0,
      base_currency: normalizeOptionalString(args.base_currency),
      converted_amount: args.converted_amount,
      exchange_rate: args.exchange_rate,
    });

    await logActivity(ctx, "expense", expenseId, "submitted", actor._id);
    await clearApprovalsForExpense(ctx, expenseId);
    await generateApprovalChain(ctx, expenseId, actor, actor.company_id, category, amount);

    return expenseId;
  },
});

export const getAllExpenses = query({
  args: {},
  handler: async (ctx) => {
    const actor = requireAdminRole(await requireActor(ctx));

    const [expenses, companyUsers] = await Promise.all([
      ctx.db
        .query("expenses")
        .withIndex("by_company", (q) => q.eq("company_id", actor.company_id))
        .order("desc")
        .collect(),
      ctx.db
        .query("users")
        .withIndex("by_company", (q) => q.eq("company_id", actor.company_id))
        .collect(),
    ]);

    const userNameById = new Map(companyUsers.map((user) => [String(user._id), user.name]));

    return await Promise.all(
      expenses.map(async (expense) => {
        const approvals = await ctx.db
          .query("expense_approvals")
          .withIndex("by_expense", (q) => q.eq("expense_id", expense._id))
          .collect();

        const approvers = approvals
          .map((approval) => ({
            ...approval,
            name: userNameById.get(String(approval.user_id)),
          }))
          .sort((a, b) => a.step_order - b.step_order);

        return {
          ...expense,
          submitter_name: userNameById.get(String(expense.user_id)),
          approvers,
        };
      })
    );
  },
});

export const overrideExpense = mutation({
  args: {
    expense_id: v.id("expenses"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    comments: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = requireAdminRole(await requireActor(ctx));
    const expense = await getExpenseInActorCompany(ctx, actor, args.expense_id);

    if (expense.status !== "pending") {
      fail("INVALID_STATE", "Only pending expenses can be overridden.");
    }

    await ctx.db.patch(args.expense_id, { status: args.status as ExpenseStatus });

    await logActivity(
      ctx,
      "expense",
      args.expense_id,
      `admin_override_${args.status}`,
      actor._id,
      { comments: normalizeOptionalString(args.comments) }
    );

    const pendingApprovals = await ctx.db
      .query("expense_approvals")
      .withIndex("by_expense", (q) => q.eq("expense_id", args.expense_id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    for (const approval of pendingApprovals) {
      await ctx.db.patch(approval._id, { status: "skipped" });
    }

    return args.expense_id;
  },
});

export const getMyExpenses = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireActor(ctx);

    const [expenses, companyUsers] = await Promise.all([
      ctx.db
        .query("expenses")
        .withIndex("by_user", (q) => q.eq("user_id", actor._id))
        .filter((q) => q.eq(q.field("company_id"), actor.company_id))
        .order("desc")
        .collect(),
      ctx.db
        .query("users")
        .withIndex("by_company", (q) => q.eq("company_id", actor.company_id))
        .collect(),
    ]);

    const userNameById = new Map(companyUsers.map((user) => [String(user._id), user.name]));

    return await Promise.all(
      expenses.map(async (expense) => {
        const approvals = await ctx.db
          .query("expense_approvals")
          .withIndex("by_expense", (q) => q.eq("expense_id", expense._id))
          .collect();

        const approvers = approvals
          .map((approval) => ({
            ...approval,
            name: userNameById.get(String(approval.user_id)),
          }))
          .sort((a, b) => a.step_order - b.step_order);

        return {
          ...expense,
          approvers,
        };
      })
    );
  },
});

export const createDraftExpense = mutation({
  args: {
    amount: v.number(),
    currency: v.string(),
    category: v.string(),
    receipt_url: v.optional(v.string()),
    ocr_data: v.optional(
      v.object({
        extracted: v.any(),
        raw: v.any(),
        confidence: v.number(),
      })
    ),
    description: v.optional(v.string()),
    expense_date: v.optional(v.string()),
    paid_by: v.optional(v.string()),
    remarks: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);

    const amount = validatePositiveAmount(args.amount);
    const currency = normalizeRequiredString(args.currency, "Currency");
    const category = normalizeRequiredString(args.category, "Category");

    const expenseId = await ctx.db.insert("expenses", {
      company_id: actor.company_id,
      user_id: actor._id,
      amount,
      currency,
      category,
      description: normalizeOptionalString(args.description),
      expense_date: normalizeOptionalString(args.expense_date),
      paid_by: normalizeOptionalString(args.paid_by),
      remarks: normalizeOptionalString(args.remarks),
      receipt_url: normalizeOptionalString(args.receipt_url),
      ocr_data: args.ocr_data,
      status: "draft",
    });

    await logActivity(ctx, "expense", expenseId, "draft_created", actor._id);
    return expenseId;
  },
});

export const updateDraftExpense = mutation({
  args: {
    expense_id: v.id("expenses"),
    updates: v.object({
      amount: v.optional(v.number()),
      currency: v.optional(v.string()),
      category: v.optional(v.string()),
      description: v.optional(v.string()),
      expense_date: v.optional(v.string()),
      paid_by: v.optional(v.string()),
      remarks: v.optional(v.string()),
      receipt_url: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const expense = await getExpenseInActorCompany(ctx, actor, args.expense_id);

    assertExpenseOwner(actor, expense);

    if (expense.status !== "draft") {
      fail("INVALID_STATE", "Only draft expenses can be updated.");
    }

    const patch = buildDraftPatch(args.updates);
    if (Object.keys(patch).length === 0) {
      return args.expense_id;
    }

    await ctx.db.patch(args.expense_id, patch);
    return args.expense_id;
  },
});

export const deleteDraftExpense = mutation({
  args: { expense_id: v.id("expenses") },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const expense = await getExpenseInActorCompany(ctx, actor, args.expense_id);

    assertExpenseOwner(actor, expense);

    if (expense.status !== "draft") {
      fail("INVALID_STATE", "Only draft expenses can be deleted.");
    }

    await clearApprovalsForExpense(ctx, args.expense_id);
    await ctx.db.delete(args.expense_id);
    return args.expense_id;
  },
});

export const submitDraftExpense = mutation({
  args: { expense_id: v.id("expenses") },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const expense = await getExpenseInActorCompany(ctx, actor, args.expense_id);

    assertExpenseOwner(actor, expense);

    if (expense.status !== "draft") {
      fail("INVALID_STATE", "Expense is not in draft status.");
    }

    await ctx.db.patch(args.expense_id, {
      status: "pending",
      submitted_at: Date.now(),
      current_approver_index: 0,
    });

    await logActivity(ctx, "expense", args.expense_id, "submitted", actor._id);
    await clearApprovalsForExpense(ctx, args.expense_id);
    await generateApprovalChain(
      ctx,
      args.expense_id,
      actor,
      actor.company_id,
      expense.category,
      expense.amount
    );

    return args.expense_id;
  },
});
