import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { QUERY_HARD_LIMIT } from "./constants";
import { logActivity } from "./lib/activity";
import { assertOrFail, fail } from "./lib/errors";
import { requireRole, requireSameCompany } from "./lib/rbac";
import { resolveMatchingRule } from "./ruleEngine";

type RuleConditionType = "all" | "percentage" | "specific" | "hybrid";

function normalizeRuleText(value: string | undefined | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function validateCondition(
  conditionType: RuleConditionType,
  requiredPercentage: number | null,
  specificApproverId: Id<"users"> | null,
) {
  if ((conditionType === "percentage" || conditionType === "hybrid") && requiredPercentage === null) {
    fail("VALIDATION_ERROR", "requiredPercentage is required for percentage and hybrid rules.");
  }
  if (
    requiredPercentage !== null &&
    (requiredPercentage <= 0 || requiredPercentage > 100)
  ) {
    fail("VALIDATION_ERROR", "requiredPercentage must be between 0 and 100.");
  }

  if ((conditionType === "specific" || conditionType === "hybrid") && specificApproverId === null) {
    fail("VALIDATION_ERROR", "specificApproverId is required for specific and hybrid rules.");
  }
}

async function validateApprovers(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  approverIds: Id<"users">[],
  isActive: boolean,
) {
  const seen = new Set<Id<"users">>();
  for (const approverId of approverIds) {
    if (seen.has(approverId)) {
      fail("VALIDATION_ERROR", "Duplicate approver detected in ordered approver list.");
    }
    seen.add(approverId);

    const user = await ctx.db.get(approverId);
    if (!user || user.companyId !== companyId) {
      fail("VALIDATION_ERROR", "All approvers must belong to the same company.", {
        approverId,
      });
    }

    if (isActive && user.status !== "active") {
      fail("VALIDATION_ERROR", "Active rules cannot contain inactive approvers.", {
        approverId,
      });
    }
  }
}

async function upsertOrderedApprovers(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  ruleId: Id<"approvalRules">,
  approverIds: Id<"users">[],
  actorId: Id<"users">,
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("approvalRuleApprovers")
    .withIndex("by_ruleId", (q) => q.eq("ruleId", ruleId))
    .take(QUERY_HARD_LIMIT);

  for (const row of existing) {
    await ctx.db.delete(row._id);
  }

  for (const [order, approverId] of approverIds.entries()) {
    await ctx.db.insert("approvalRuleApprovers", {
      companyId,
      ruleId,
      approverId,
      order,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId,
      actorId,
      entityType: "approvalRule",
      entityId: ruleId,
      action: "rule.approver_added",
      metadata: { approverId, order },
      createdAt: now,
    });
  }
}

async function validateSpecificApprover(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  specificApproverId: Id<"users"> | null,
  isActive: boolean,
) {
  if (specificApproverId === null) {
    return;
  }

  const specificApprover = await ctx.db.get(specificApproverId);
  if (!specificApprover || specificApprover.companyId !== companyId) {
    fail("VALIDATION_ERROR", "specificApproverId must reference a user in the same company.");
  }

  if (isActive && specificApprover.status !== "active") {
    fail("VALIDATION_ERROR", "specificApproverId must be active for active rules.");
  }
}

export const listRules = query({
  args: {
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");

    const rules = args.includeInactive
      ? await ctx.db
          .query("approvalRules")
          .withIndex("by_companyId", (q) => q.eq("companyId", actor.company._id))
          .take(QUERY_HARD_LIMIT)
      : await ctx.db
          .query("approvalRules")
          .withIndex("by_companyId_and_isActive", (q) =>
            q.eq("companyId", actor.company._id).eq("isActive", true),
          )
          .take(QUERY_HARD_LIMIT);

    return await Promise.all(
      rules.map(async (rule) => {
        const approvers = await ctx.db
          .query("approvalRuleApprovers")
          .withIndex("by_ruleId_and_order", (q) => q.eq("ruleId", rule._id))
          .take(QUERY_HARD_LIMIT);
        return {
          ...rule,
          approvers,
        };
      }),
    );
  },
});

export const createRule = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    minAmount: v.number(),
    conditionType: v.union(
      v.literal("all"),
      v.literal("percentage"),
      v.literal("specific"),
      v.literal("hybrid"),
    ),
    requiredPercentage: v.optional(v.union(v.number(), v.null())),
    specificApproverId: v.optional(v.union(v.id("users"), v.null())),
    mode: v.union(v.literal("sequential"), v.literal("parallel")),
    includeManagerApprover: v.optional(v.boolean()),
    allowAdminFallback: v.optional(v.boolean()),
    priority: v.optional(v.union(v.number(), v.null())),
    isActive: v.optional(v.boolean()),
    approverIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const now = Date.now();

    const name = args.name.trim();
    if (!name) {
      fail("VALIDATION_ERROR", "Rule name is required.");
    }
    if (args.minAmount < 0) {
      fail("VALIDATION_ERROR", "minAmount cannot be negative.");
    }

    const description = normalizeRuleText(args.description ?? null);
    const category = normalizeRuleText(args.category ?? null);
    const requiredPercentage = args.requiredPercentage ?? null;
    const specificApproverId = args.specificApproverId ?? null;
    const includeManagerApprover = args.includeManagerApprover ?? false;
    const allowAdminFallback = args.allowAdminFallback ?? false;
    const isActive = args.isActive ?? true;
    const priority = args.priority ?? null;

    validateCondition(args.conditionType, requiredPercentage, specificApproverId);
    await validateSpecificApprover(ctx, actor.company._id, specificApproverId, isActive);
    await validateApprovers(ctx, actor.company._id, args.approverIds, isActive);

    if (args.approverIds.length === 0 && !allowAdminFallback) {
      fail(
        "VALIDATION_ERROR",
        "Rule must define at least one approver unless allowAdminFallback is enabled.",
      );
    }

    const ruleId = await ctx.db.insert("approvalRules", {
      companyId: actor.company._id,
      name,
      description,
      category,
      minAmount: args.minAmount,
      conditionType: args.conditionType,
      requiredPercentage,
      specificApproverId,
      mode: args.mode,
      includeManagerApprover,
      allowAdminFallback,
      priority,
      isActive,
      createdByUserId: actor.user._id,
      updatedByUserId: actor.user._id,
      createdAt: now,
      updatedAt: now,
    });

    await upsertOrderedApprovers(
      ctx,
      actor.company._id,
      ruleId,
      args.approverIds,
      actor.user._id,
    );

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "approvalRule",
      entityId: ruleId,
      action: "rule.created",
      metadata: {
        conditionType: args.conditionType,
      },
      createdAt: now,
    });

    return { ruleId };
  },
});

export const updateRule = mutation({
  args: {
    ruleId: v.id("approvalRules"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    minAmount: v.optional(v.number()),
    conditionType: v.optional(
      v.union(
        v.literal("all"),
        v.literal("percentage"),
        v.literal("specific"),
        v.literal("hybrid"),
      ),
    ),
    requiredPercentage: v.optional(v.union(v.number(), v.null())),
    specificApproverId: v.optional(v.union(v.id("users"), v.null())),
    mode: v.optional(v.union(v.literal("sequential"), v.literal("parallel"))),
    includeManagerApprover: v.optional(v.boolean()),
    allowAdminFallback: v.optional(v.boolean()),
    priority: v.optional(v.union(v.number(), v.null())),
    approverIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const rule = await ctx.db.get(args.ruleId);
    assertOrFail(rule, "NOT_FOUND", "Rule not found.");
    requireSameCompany(rule.companyId, actor.company._id);

    const now = Date.now();
    const nextConditionType = args.conditionType ?? rule.conditionType;
    const nextRequiredPercentage =
      args.requiredPercentage !== undefined ? args.requiredPercentage : rule.requiredPercentage;
    const nextSpecificApproverId =
      args.specificApproverId !== undefined ? args.specificApproverId : rule.specificApproverId;
    const nextAllowAdminFallback =
      args.allowAdminFallback !== undefined
        ? args.allowAdminFallback
        : rule.allowAdminFallback;
    const nextApproverIds = args.approverIds;

    validateCondition(
      nextConditionType,
      nextRequiredPercentage,
      nextSpecificApproverId,
    );
    await validateSpecificApprover(
      ctx,
      actor.company._id,
      nextSpecificApproverId,
      rule.isActive,
    );

    if (nextApproverIds) {
      await validateApprovers(ctx, actor.company._id, nextApproverIds, rule.isActive);
      if (nextApproverIds.length === 0 && !nextAllowAdminFallback) {
        fail(
          "VALIDATION_ERROR",
          "Rule must define at least one approver unless allowAdminFallback is enabled.",
        );
      }
    }

    if (args.minAmount !== undefined && args.minAmount < 0) {
      fail("VALIDATION_ERROR", "minAmount cannot be negative.");
    }

    await ctx.db.patch(rule._id, {
      name: args.name !== undefined ? args.name.trim() : rule.name,
      description:
        args.description !== undefined
          ? normalizeRuleText(args.description)
          : rule.description,
      category:
        args.category !== undefined ? normalizeRuleText(args.category) : rule.category,
      minAmount: args.minAmount ?? rule.minAmount,
      conditionType: nextConditionType,
      requiredPercentage: nextRequiredPercentage,
      specificApproverId: nextSpecificApproverId,
      mode: args.mode ?? rule.mode,
      includeManagerApprover:
        args.includeManagerApprover ?? rule.includeManagerApprover,
      allowAdminFallback: nextAllowAdminFallback,
      priority: args.priority !== undefined ? args.priority : rule.priority,
      updatedByUserId: actor.user._id,
      updatedAt: now,
    });

    if (nextApproverIds) {
      await upsertOrderedApprovers(
        ctx,
        actor.company._id,
        rule._id,
        nextApproverIds,
        actor.user._id,
      );
    }

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "approvalRule",
      entityId: rule._id,
      action: "rule.updated",
      metadata: null,
      createdAt: now,
    });

    return { ruleId: rule._id };
  },
});

export const setRuleActive = mutation({
  args: {
    ruleId: v.id("approvalRules"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const rule = await ctx.db.get(args.ruleId);
    assertOrFail(rule, "NOT_FOUND", "Rule not found.");
    requireSameCompany(rule.companyId, actor.company._id);

    const approvers = await ctx.db
      .query("approvalRuleApprovers")
      .withIndex("by_ruleId", (q) => q.eq("ruleId", rule._id))
      .take(QUERY_HARD_LIMIT);

    if (args.isActive) {
      for (const entry of approvers) {
        const approver = await ctx.db.get(entry.approverId);
        if (!approver || approver.companyId !== actor.company._id || approver.status !== "active") {
          fail("VALIDATION_ERROR", "Cannot activate rule with inactive or invalid approvers.");
        }
      }
    }

    const now = Date.now();
    await ctx.db.patch(rule._id, {
      isActive: args.isActive,
      updatedByUserId: actor.user._id,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "approvalRule",
      entityId: rule._id,
      action: args.isActive ? "rule.activated" : "rule.deactivated",
      metadata: null,
      createdAt: now,
    });

    return {
      ruleId: rule._id,
      isActive: args.isActive,
    };
  },
});

export const setRuleApprovers = mutation({
  args: {
    ruleId: v.id("approvalRules"),
    approverIds: v.array(v.id("users")),
    allowAdminFallback: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const rule = await ctx.db.get(args.ruleId);
    assertOrFail(rule, "NOT_FOUND", "Rule not found.");
    requireSameCompany(rule.companyId, actor.company._id);

    const allowAdminFallback = args.allowAdminFallback ?? rule.allowAdminFallback;

    await validateApprovers(ctx, actor.company._id, args.approverIds, rule.isActive);
    if (args.approverIds.length === 0 && !allowAdminFallback) {
      fail(
        "VALIDATION_ERROR",
        "Rule must define at least one approver unless allowAdminFallback is enabled.",
      );
    }

    await upsertOrderedApprovers(
      ctx,
      actor.company._id,
      rule._id,
      args.approverIds,
      actor.user._id,
    );

    const now = Date.now();
    await ctx.db.patch(rule._id, {
      allowAdminFallback,
      updatedByUserId: actor.user._id,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "approvalRule",
      entityId: rule._id,
      action: "rule.updated",
      metadata: {
        approverCount: args.approverIds.length,
      },
      createdAt: now,
    });

    return {
      ruleId: rule._id,
      approverCount: args.approverIds.length,
    };
  },
});

export const previewRuleMatch = query({
  args: {
    category: v.string(),
    normalizedAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const rule = await resolveMatchingRule(ctx, {
      companyId: actor.company._id,
      category: args.category,
      normalizedAmount: args.normalizedAmount,
    });

    return {
      rule,
    };
  },
});
