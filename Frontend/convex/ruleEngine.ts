import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { QUERY_HARD_LIMIT } from "./constants";
import { fail } from "./security/errors";
import type { RuleMatchInput, RuleResolution } from "./types";

type RuleReadContext = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

function isCategoryMatch(ruleCategory: string | undefined, expenseCategory: string) {
  if (!ruleCategory) {
    return true;
  }
  return ruleCategory === expenseCategory;
}

function categorySpecificity(ruleCategory: string | undefined, expenseCategory: string) {
  return ruleCategory === expenseCategory ? 1 : 0;
}

function thresholdValue(ruleThreshold: number | undefined) {
  return ruleThreshold ?? 0;
}

function priorityValue(rulePriority: number) {
  return rulePriority;
}

export function compareRules(
  a: Doc<"approval_rules">,
  b: Doc<"approval_rules">,
  expenseCategory: string
) {
  const specificityDelta =
    categorySpecificity(b.category, expenseCategory) -
    categorySpecificity(a.category, expenseCategory);
  if (specificityDelta !== 0) {
    return specificityDelta;
  }

  const thresholdDelta = thresholdValue(b.amount_threshold) - thresholdValue(a.amount_threshold);
  if (thresholdDelta !== 0) {
    return thresholdDelta;
  }

  const priorityDelta = priorityValue(b.priority) - priorityValue(a.priority);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return a._id.localeCompare(b._id);
}

export async function resolveMatchingRule(
  ctx: RuleReadContext,
  input: RuleMatchInput
): Promise<Doc<"approval_rules"> | null> {
  const rules = await ctx.db
    .query("approval_rules")
    .withIndex("by_company", (q) => q.eq("company_id", input.company_id))
    .take(QUERY_HARD_LIMIT);

  const candidates = rules
    .filter((rule) => isCategoryMatch(rule.category, input.category))
    .filter((rule) => (rule.amount_threshold === undefined ? true : input.amount >= rule.amount_threshold));

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => compareRules(a, b, input.category));
  return candidates[0] ?? null;
}

async function getRuleApproverIds(
  ctx: RuleReadContext,
  companyId: Id<"companies">,
  ruleId: Id<"approval_rules">
): Promise<Id<"users">[]> {
  const approverDocs = await ctx.db
    .query("rule_approvers")
    .withIndex("by_rule", (q) => q.eq("rule_id", ruleId))
    .take(QUERY_HARD_LIMIT);

  const orderedApproverIds = approverDocs
    .sort((a, b) => a.sequence_order - b.sequence_order)
    .map((entry) => entry.user_id);

  const unique: Id<"users">[] = [];
  const seen = new Set<string>();

  for (const approverId of orderedApproverIds) {
    if (seen.has(String(approverId))) {
      continue;
    }
    seen.add(String(approverId));

    const approver = await ctx.db.get(approverId);
    if (!approver || approver.company_id !== companyId) {
      fail("INVALID_STATE", "Rule approver is invalid for this company.");
    }
    if (approver.role === "employee") {
      fail("INVALID_STATE", "Rule approver must have manager or admin role.");
    }

    unique.push(approverId);
  }

  return unique;
}

async function getAdminFallbackApprovers(
  ctx: RuleReadContext,
  companyId: Id<"companies">
): Promise<Id<"users">[]> {
  const companyUsers = await ctx.db
    .query("users")
    .withIndex("by_company", (q) => q.eq("company_id", companyId))
    .take(QUERY_HARD_LIMIT);

  const admins = companyUsers
    .filter((user) => user.role === "admin")
    .sort((a, b) => a._creationTime - b._creationTime)
    .map((user) => user._id);

  if (admins.length === 0) {
    fail("INVALID_STATE", "No admin is available for fallback approvals.");
  }

  return admins;
}

export async function resolveRuleAndApprovers(
  ctx: RuleReadContext,
  input: RuleMatchInput & { user_id: Id<"users"> }
): Promise<RuleResolution> {
  const resolvedRule = await resolveMatchingRule(ctx, input);

  if (!resolvedRule) {
    return {
      rule_id: null,
      approval_mode: "sequential",
      approver_ids: await getAdminFallbackApprovers(ctx, input.company_id),
      used_admin_fallback: true,
    };
  }

  let approverIds = await getRuleApproverIds(ctx, input.company_id, resolvedRule._id);

  if (resolvedRule.specific_approver_id) {
    approverIds = [
      resolvedRule.specific_approver_id,
      ...approverIds.filter((id) => id !== resolvedRule.specific_approver_id),
    ];
  }

  if (resolvedRule.manager_injection) {
    const submitter = await ctx.db.get(input.user_id);
    if (!submitter || submitter.company_id !== input.company_id) {
      fail("INVALID_STATE", "Expense submitter could not be resolved for manager injection.");
    }

    if (submitter.manager_id) {
      const manager = await ctx.db.get(submitter.manager_id);
      if (manager && manager.company_id === input.company_id && manager.role !== "employee") {
        approverIds = [
          manager._id,
          ...approverIds.filter((id) => id !== manager._id),
        ];
      }
    }
  }

  approverIds = [...new Set(approverIds)];

  if (approverIds.length === 0) {
    return {
      rule_id: resolvedRule._id,
      approval_mode: resolvedRule.approval_mode,
      approver_ids: await getAdminFallbackApprovers(ctx, input.company_id),
      used_admin_fallback: true,
    };
  }

  return {
    rule_id: resolvedRule._id,
    approval_mode: resolvedRule.approval_mode,
    approver_ids: approverIds,
    used_admin_fallback: false,
  };
}
