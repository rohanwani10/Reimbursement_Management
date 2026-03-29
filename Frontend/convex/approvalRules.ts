import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { QUERY_HARD_LIMIT } from "./constants";
import { resolveMatchingRule } from "./ruleEngine";
import { requireAdmin } from "./security/auth";
import { fail } from "./security/errors";
import { getUserInActorCompany } from "./security/tenancy";

export const listRules = query({
  args: {
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx) => {
    const actor = await requireAdmin(ctx);

    const rules = await ctx.db
      .query("approval_rules")
      .withIndex("by_company", (q) => q.eq("company_id", actor.company_id))
      .take(QUERY_HARD_LIMIT);

    return await Promise.all(
      rules.map(async (rule) => {
        const approvers = await ctx.db
          .query("rule_approvers")
          .withIndex("by_rule", (q) => q.eq("rule_id", rule._id))
          .take(QUERY_HARD_LIMIT);

        return {
          ...rule,
          approvers: approvers.sort((a, b) => a.sequence_order - b.sequence_order),
          is_active: true,
        };
      })
    );
  },
});

export const setRuleActive = mutation({
  args: {
    rule_id: v.id("approval_rules"),
    is_active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const rule = await ctx.db.get(args.rule_id);
    if (!rule) {
      fail("NOT_FOUND", "Rule not found.");
    }
    if (rule.company_id !== actor.company_id) {
      fail("FORBIDDEN", "Cannot modify a rule from another company.");
    }

    if (!args.is_active) {
      fail(
        "INVALID_STATE",
        "Rule activation toggle is not supported by the current schema. Use delete/update instead."
      );
    }

    return {
      rule_id: rule._id,
      is_active: true,
    };
  },
});

export const setRuleApprovers = mutation({
  args: {
    rule_id: v.id("approval_rules"),
    approver_ids: v.array(v.id("users")),
    allow_admin_fallback: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const rule = await ctx.db.get(args.rule_id);
    if (!rule) {
      fail("NOT_FOUND", "Rule not found.");
    }
    if (rule.company_id !== actor.company_id) {
      fail("FORBIDDEN", "Cannot modify a rule from another company.");
    }

    const dedupedApproverIds: Id<"users">[] = [];
    const seen = new Set<string>();

    for (const approverId of args.approver_ids) {
      if (seen.has(String(approverId))) {
        continue;
      }
      seen.add(String(approverId));

      const approver = await getUserInActorCompany(ctx, actor, approverId);
      if (approver.role === "employee") {
        fail("VALIDATION_ERROR", "Approvers must have admin or manager role.");
      }

      dedupedApproverIds.push(approverId);
    }

    const allowAdminFallback = args.allow_admin_fallback ?? false;
    if (dedupedApproverIds.length === 0 && !allowAdminFallback) {
      fail(
        "VALIDATION_ERROR",
        "Rule must define at least one approver unless allow_admin_fallback is enabled."
      );
    }

    const existingApprovers = await ctx.db
      .query("rule_approvers")
      .withIndex("by_rule", (q) => q.eq("rule_id", rule._id))
      .take(QUERY_HARD_LIMIT);

    for (const approver of existingApprovers) {
      await ctx.db.delete(approver._id);
    }

    for (const [index, approverId] of dedupedApproverIds.entries()) {
      await ctx.db.insert("rule_approvers", {
        rule_id: rule._id,
        user_id: approverId,
        required: true,
        sequence_order: index + 1,
      });
    }

    return {
      rule_id: rule._id,
      approver_count: dedupedApproverIds.length,
      allow_admin_fallback: allowAdminFallback,
    };
  },
});

export const previewRuleMatch = query({
  args: {
    category: v.string(),
    normalizedAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);

    const rule = await resolveMatchingRule(ctx, {
      company_id: actor.company_id,
      category: args.category.trim(),
      amount: args.normalizedAmount,
    });

    return { rule };
  },
});
