import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./security/auth";
import { fail } from "./security/errors";
import { getUserInActorCompany } from "./security/tenancy";

const logicTypeValidator = v.union(
  v.literal("all"),
  v.literal("percentage"),
  v.literal("specific"),
  v.literal("hybrid")
);

const approvalModeValidator = v.union(v.literal("sequential"), v.literal("parallel"));

const approverValidator = v.object({
  user_id: v.id("users"),
  required: v.boolean(),
  sequence_order: v.number(),
});

type RuleApproverInput = {
  user_id: Id<"users">;
  required: boolean;
  sequence_order: number;
};

type RuleInput = {
  name: string;
  category?: string;
  amount_threshold?: number;
  logic_type: "all" | "percentage" | "specific" | "hybrid";
  priority: number;
  manager_injection: boolean;
  approval_mode: "sequential" | "parallel";
  min_percentage?: number;
  specific_approver_id?: Id<"users">;
  approvers: RuleApproverInput[];
};

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function validateRuleInput(
  ctx: MutationCtx,
  actor: Awaited<ReturnType<typeof requireAdmin>>,
  args: RuleInput
): Promise<{
  ruleData: {
    company_id: Id<"companies">;
    name: string;
    category?: string;
    amount_threshold?: number;
    logic_type: "all" | "percentage" | "specific" | "hybrid";
    priority: number;
    manager_injection: boolean;
    approval_mode: "sequential" | "parallel";
    min_percentage?: number;
    specific_approver_id?: Id<"users">;
  };
  approvers: RuleApproverInput[];
}> {
  const name = args.name.trim();
  if (name.length === 0) {
    fail("VALIDATION_ERROR", "Rule name cannot be empty.");
  }

  if (!Number.isInteger(args.priority) || args.priority < 1) {
    fail("VALIDATION_ERROR", "Rule priority must be a positive integer.");
  }

  if (args.amount_threshold !== undefined && args.amount_threshold < 0) {
    fail("VALIDATION_ERROR", "Amount threshold cannot be negative.");
  }

  const approvers = [...args.approvers]
    .map((a) => ({ ...a, sequence_order: Math.trunc(a.sequence_order) }))
    .sort((a, b) => a.sequence_order - b.sequence_order);

  if (approvers.length === 0 && !args.manager_injection) {
    fail(
      "VALIDATION_ERROR",
      "Rule must define at least one approver when manager injection is disabled."
    );
  }

  const seenApprovers = new Set<string>();
  const seenOrders = new Set<number>();
  for (const approver of approvers) {
    if (approver.sequence_order < 1) {
      fail("VALIDATION_ERROR", "Approver sequence_order must be >= 1.");
    }

    if (seenOrders.has(approver.sequence_order)) {
      fail("VALIDATION_ERROR", "Approver sequence_order values must be unique.");
    }
    seenOrders.add(approver.sequence_order);

    const approverKey = String(approver.user_id);
    if (seenApprovers.has(approverKey)) {
      fail("VALIDATION_ERROR", "Approver list cannot contain duplicate users.");
    }
    seenApprovers.add(approverKey);

    const approverUser = await getUserInActorCompany(ctx, actor, approver.user_id);
    if (approverUser.role === "employee") {
      fail(
        "VALIDATION_ERROR",
        "Approvers must have admin or manager role."
      );
    }
  }

  if (args.approval_mode === "sequential") {
    for (let i = 0; i < approvers.length; i += 1) {
      if (approvers[i].sequence_order !== i + 1) {
        fail(
          "VALIDATION_ERROR",
          "Sequential mode requires contiguous sequence_order values starting at 1."
        );
      }
    }
  }

  if (args.logic_type === "all") {
    if (args.min_percentage !== undefined || args.specific_approver_id !== undefined) {
      fail(
        "VALIDATION_ERROR",
        "Logic type 'all' does not allow min_percentage or specific_approver_id."
      );
    }
  }

  if (args.logic_type === "percentage" || args.logic_type === "hybrid") {
    if (args.min_percentage === undefined) {
      fail(
        "VALIDATION_ERROR",
        `Logic type '${args.logic_type}' requires min_percentage.`
      );
    }
    if (args.min_percentage <= 0 || args.min_percentage > 100) {
      fail("VALIDATION_ERROR", "min_percentage must be between 1 and 100.");
    }
  }

  if (args.logic_type === "specific" || args.logic_type === "hybrid") {
    if (!args.specific_approver_id) {
      fail(
        "VALIDATION_ERROR",
        `Logic type '${args.logic_type}' requires specific_approver_id.`
      );
    }

    const specificApprover = await getUserInActorCompany(ctx, actor, args.specific_approver_id);
    if (specificApprover.role === "employee") {
      fail(
        "VALIDATION_ERROR",
        "specific_approver_id must reference an admin or manager."
      );
    }
  }

  const ruleData: {
    company_id: Id<"companies">;
    name: string;
    logic_type: "all" | "percentage" | "specific" | "hybrid";
    priority: number;
    manager_injection: boolean;
    approval_mode: "sequential" | "parallel";
    category?: string;
    amount_threshold?: number;
    min_percentage?: number;
    specific_approver_id?: Id<"users">;
  } = {
    company_id: actor.company_id,
    name,
    logic_type: args.logic_type,
    priority: args.priority,
    manager_injection: args.manager_injection,
    approval_mode: args.approval_mode,
  };

  const category = normalizeOptionalString(args.category);
  if (category !== undefined) {
    ruleData.category = category;
  }
  if (args.amount_threshold !== undefined) {
    ruleData.amount_threshold = args.amount_threshold;
  }
  if (args.min_percentage !== undefined) {
    ruleData.min_percentage = args.min_percentage;
  }
  if (args.specific_approver_id !== undefined) {
    ruleData.specific_approver_id = args.specific_approver_id;
  }

  return { ruleData, approvers };
}

export const createRule = mutation({
  args: {
    name: v.string(),
    category: v.optional(v.string()),
    amount_threshold: v.optional(v.number()),
    logic_type: logicTypeValidator,
    priority: v.number(),
    manager_injection: v.boolean(),
    approval_mode: approvalModeValidator,
    min_percentage: v.optional(v.number()),
    specific_approver_id: v.optional(v.id("users")),
    approvers: v.array(approverValidator),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const { ruleData, approvers } = await validateRuleInput(ctx, actor, args);

    const ruleId = await ctx.db.insert("approval_rules", ruleData);

    for (const approver of approvers) {
      await ctx.db.insert("rule_approvers", {
        rule_id: ruleId,
        user_id: approver.user_id,
        required: approver.required,
        sequence_order: approver.sequence_order,
      });
    }

    return ruleId;
  },
});

export const getRules = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAdmin(ctx);

    const rules = await ctx.db
      .query("approval_rules")
      .withIndex("by_company", (q) => q.eq("company_id", actor.company_id))
      .collect();

    return await Promise.all(
      rules.map(async (rule) => {
        const approvers = await ctx.db
          .query("rule_approvers")
          .withIndex("by_rule", (q) => q.eq("rule_id", rule._id))
          .collect();
        return { ...rule, approvers };
      })
    );
  },
});

export const deleteRule = mutation({
  args: { rule_id: v.id("approval_rules") },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);

    const rule = await ctx.db.get(args.rule_id);
    if (!rule) {
      fail("NOT_FOUND", "Rule not found.");
    }
    if (rule.company_id !== actor.company_id) {
      fail("FORBIDDEN", "Cannot delete a rule from another company.");
    }

    const approvers = await ctx.db
      .query("rule_approvers")
      .withIndex("by_rule", (q) => q.eq("rule_id", args.rule_id))
      .collect();

    for (const approver of approvers) {
      await ctx.db.delete(approver._id);
    }
    await ctx.db.delete(args.rule_id);

    return args.rule_id;
  },
});

export const updateRule = mutation({
  args: {
    rule_id: v.id("approval_rules"),
    name: v.string(),
    category: v.optional(v.string()),
    amount_threshold: v.optional(v.number()),
    logic_type: logicTypeValidator,
    priority: v.number(),
    manager_injection: v.boolean(),
    approval_mode: approvalModeValidator,
    min_percentage: v.optional(v.number()),
    specific_approver_id: v.optional(v.id("users")),
    approvers: v.array(approverValidator),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);

    const existingRule = await ctx.db.get(args.rule_id);
    if (!existingRule) {
      fail("NOT_FOUND", "Rule not found.");
    }
    if (existingRule.company_id !== actor.company_id) {
      fail("FORBIDDEN", "Cannot update a rule from another company.");
    }

    const { rule_id, ...ruleInput } = args;
    const { ruleData, approvers } = await validateRuleInput(ctx, actor, ruleInput);

    await ctx.db.patch(rule_id, ruleData);

    const oldApprovers = await ctx.db
      .query("rule_approvers")
      .withIndex("by_rule", (q) => q.eq("rule_id", rule_id))
      .collect();

    for (const approver of oldApprovers) {
      await ctx.db.delete(approver._id);
    }

    for (const approver of approvers) {
      await ctx.db.insert("rule_approvers", {
        rule_id,
        user_id: approver.user_id,
        required: approver.required,
        sequence_order: approver.sequence_order,
      });
    }

    return rule_id;
  },
});
