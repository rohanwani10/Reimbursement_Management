import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { QUERY_HARD_LIMIT } from "./constants";
import { fail } from "./lib/errors";
import type { RuleMatchInput, RuleResolution } from "./types";

type RuleReadContext = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

function isCategoryMatch(ruleCategory: string | null, expenseCategory: string) {
  if (ruleCategory === null) {
    return true;
  }
  return ruleCategory === expenseCategory;
}

function categorySpecificity(ruleCategory: string | null, expenseCategory: string) {
  return ruleCategory === expenseCategory ? 1 : 0;
}

function priorityValue(rulePriority: number | null) {
  return rulePriority ?? Number.MAX_SAFE_INTEGER;
}

export function compareRules(
  a: Doc<"approvalRules">,
  b: Doc<"approvalRules">,
  expenseCategory: string,
) {
  const specificityDelta =
    categorySpecificity(b.category, expenseCategory) -
    categorySpecificity(a.category, expenseCategory);
  if (specificityDelta !== 0) {
    return specificityDelta;
  }

  const thresholdDelta = b.minAmount - a.minAmount;
  if (thresholdDelta !== 0) {
    return thresholdDelta;
  }

  const priorityDelta = priorityValue(a.priority) - priorityValue(b.priority);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const createdDelta = a._creationTime - b._creationTime;
  if (createdDelta !== 0) {
    return createdDelta;
  }

  return a._id.localeCompare(b._id);
}

export async function resolveMatchingRule(
  ctx: RuleReadContext,
  input: RuleMatchInput,
): Promise<Doc<"approvalRules"> | null> {
  const activeRules = await ctx.db
    .query("approvalRules")
    .withIndex("by_companyId_and_isActive", (q) =>
      q.eq("companyId", input.companyId).eq("isActive", true),
    )
    .take(QUERY_HARD_LIMIT);

  const candidates = activeRules
    .filter((rule) => isCategoryMatch(rule.category, input.category))
    .filter((rule) => rule.minAmount <= input.normalizedAmount);

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => compareRules(a, b, input.category));
  return candidates[0] ?? null;
}

async function validateApproverAndCollect(
  ctx: RuleReadContext,
  companyId: Id<"companies">,
  approverIds: Id<"users">[],
) {
  const activeApproverIds: Id<"users">[] = [];

  for (const approverId of approverIds) {
    const approver = await ctx.db.get(approverId);
    if (!approver || approver.companyId !== companyId) {
      fail("INVALID_STATE", "Rule approver is invalid for this company.", {
        approverId,
      });
    }
    if (approver.status !== "active") {
      fail("INVALID_STATE", "Rule approver must be active.", {
        approverId,
      });
    }
    activeApproverIds.push(approverId);
  }

  return activeApproverIds;
}

async function getRuleApproverIds(
  ctx: RuleReadContext,
  companyId: Id<"companies">,
  ruleId: Id<"approvalRules">,
) {
  const approverDocs = await ctx.db
    .query("approvalRuleApprovers")
    .withIndex("by_ruleId_and_order", (q) => q.eq("ruleId", ruleId))
    .take(QUERY_HARD_LIMIT);

  const orderedApproverIds = approverDocs
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.approverId);

  return await validateApproverAndCollect(ctx, companyId, orderedApproverIds);
}

async function getAdminFallbackApprovers(
  ctx: RuleReadContext,
  companyId: Id<"companies">,
) {
  const companyUsers = await ctx.db
    .query("users")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .take(QUERY_HARD_LIMIT);

  const admins = companyUsers
    .filter((user) => user.role === "admin" && user.status === "active")
    .sort((a, b) => a._creationTime - b._creationTime)
    .map((user) => user._id);

  if (admins.length === 0) {
    fail("INVALID_STATE", "No active admin is available for fallback approvals.");
  }

  return admins;
}

export async function resolveRuleAndApprovers(
  ctx: RuleReadContext,
  input: RuleMatchInput & { employeeId: Id<"users"> },
): Promise<RuleResolution> {
  const resolvedRule = await resolveMatchingRule(ctx, input);

  if (!resolvedRule) {
    return {
      ruleId: null,
      mode: "sequential",
      approverIds: await getAdminFallbackApprovers(ctx, input.companyId),
      usedAdminFallback: true,
    };
  }

  let approverIds = await getRuleApproverIds(ctx, input.companyId, resolvedRule._id);

  if (resolvedRule.includeManagerApprover) {
    const employee = await ctx.db.get(input.employeeId);
    if (!employee || employee.companyId !== input.companyId) {
      fail("INVALID_STATE", "Expense submitter could not be resolved for manager prepending.");
    }

    if (employee.managerId) {
      const manager = await ctx.db.get(employee.managerId);
      if (manager && manager.companyId === input.companyId && manager.status === "active") {
        approverIds = [manager._id, ...approverIds.filter((id) => id !== manager._id)];
      }
    }
  }

  approverIds = [...new Set(approverIds)];
  if (approverIds.length === 0) {
    if (!resolvedRule.allowAdminFallback) {
      fail("INVALID_STATE", "Matched rule produced an empty approval chain.", {
        ruleId: resolvedRule._id,
      });
    }

    return {
      ruleId: resolvedRule._id,
      mode: resolvedRule.mode,
      approverIds: await getAdminFallbackApprovers(ctx, input.companyId),
      usedAdminFallback: true,
    };
  }

  return {
    ruleId: resolvedRule._id,
    mode: resolvedRule.mode,
    approverIds,
    usedAdminFallback: false,
  };
}
