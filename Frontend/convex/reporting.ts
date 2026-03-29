import { v } from "convex/values";

import { api } from "./_generated/api";
import { action, query } from "./_generated/server";
import { QUERY_HARD_LIMIT, REPORT_DEFAULT_LIMIT } from "./constants";
import { requireRole } from "./lib/rbac";

type ReportRow = {
  expenseId: string;
  employeeId: string;
  status: "draft" | "pending" | "approved" | "rejected";
  amount: number | null;
  currencyCode: string | null;
  normalizedAmount: number | null;
  normalizedCurrencyCode: string | null;
  category: string | null;
  expenseDate: string | null;
  submittedAt: number | null;
  matchedRuleId: string | null;
  approvalMode: "sequential" | "parallel" | null;
};

function csvEscape(value: string | number | null) {
  if (value === null) {
    return "";
  }

  const str = String(value);
  if (!str.includes(",") && !str.includes("\n") && !str.includes('"')) {
    return str;
  }

  return `"${str.replaceAll('"', '""')}"`;
}

function withinRange(
  value: number | null,
  fromSubmittedAt: number | null,
  toSubmittedAt: number | null,
) {
  if (value === null) {
    return false;
  }
  if (fromSubmittedAt !== null && value < fromSubmittedAt) {
    return false;
  }
  if (toSubmittedAt !== null && value > toSubmittedAt) {
    return false;
  }
  return true;
}

export const listExpenseReportRows = query({
  args: {
    status: v.optional(
      v.union(v.literal("draft"), v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    ),
    fromSubmittedAt: v.optional(v.union(v.number(), v.null())),
    toSubmittedAt: v.optional(v.union(v.number(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const limit = Math.max(
      1,
      Math.min(args.limit ?? REPORT_DEFAULT_LIMIT, QUERY_HARD_LIMIT),
    );
    const fromSubmittedAt = args.fromSubmittedAt ?? null;
    const toSubmittedAt = args.toSubmittedAt ?? null;

    const baseRows = args.status
      ? await ctx.db
          .query("expenses")
          .withIndex("by_companyId_and_status", (q) =>
            q.eq("companyId", actor.company._id).eq("status", args.status!),
          )
          .order("desc")
          .take(limit * 3)
      : await ctx.db
          .query("expenses")
          .withIndex("by_companyId", (q) => q.eq("companyId", actor.company._id))
          .order("desc")
          .take(limit * 3);

    const filtered = baseRows
      .filter((row) => withinRange(row.submittedAt, fromSubmittedAt, toSubmittedAt))
      .slice(0, limit);

    return filtered.map((row) => ({
      expenseId: row._id,
      employeeId: row.employeeId,
      status: row.status,
      amount: row.amount,
      currencyCode: row.currencyCode,
      normalizedAmount: row.normalizedAmount,
      normalizedCurrencyCode: row.normalizedCurrencyCode,
      category: row.category,
      expenseDate: row.expenseDate,
      submittedAt: row.submittedAt,
      matchedRuleId: row.matchedRuleId,
      approvalMode: row.approvalMode,
    }));
  },
});

export const approvalTurnaroundSummary = query({
  args: {
    fromSubmittedAt: v.optional(v.union(v.number(), v.null())),
    toSubmittedAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const fromSubmittedAt = args.fromSubmittedAt ?? null;
    const toSubmittedAt = args.toSubmittedAt ?? null;

    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_companyId", (q) => q.eq("companyId", actor.company._id))
      .take(QUERY_HARD_LIMIT);

    const terminal = expenses.filter(
      (expense) =>
        (expense.status === "approved" || expense.status === "rejected") &&
        withinRange(expense.submittedAt, fromSubmittedAt, toSubmittedAt),
    );

    const rows = [] as number[];
    for (const expense of terminal) {
      const approvals = await ctx.db
        .query("expenseApprovals")
        .withIndex("by_expenseId", (q) => q.eq("expenseId", expense._id))
        .take(QUERY_HARD_LIMIT);

      const actedTimes = approvals
        .map((approval) => approval.actedAt)
        .filter((actedAt): actedAt is number => actedAt !== null);

      if (expense.submittedAt === null || actedTimes.length === 0) {
        continue;
      }

      const completedAt = Math.max(...actedTimes);
      rows.push(completedAt - expense.submittedAt);
    }

    if (rows.length === 0) {
      return {
        count: 0,
        averageMs: null,
        maxMs: null,
        minMs: null,
      };
    }

    const total = rows.reduce((acc, value) => acc + value, 0);
    return {
      count: rows.length,
      averageMs: Math.round(total / rows.length),
      maxMs: Math.max(...rows),
      minMs: Math.min(...rows),
    };
  },
});

export const exportExpensesCsv = action({
  args: {
    status: v.optional(
      v.union(v.literal("draft"), v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    ),
    fromSubmittedAt: v.optional(v.union(v.number(), v.null())),
    toSubmittedAt: v.optional(v.union(v.number(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows: ReportRow[] = await ctx.runQuery(api.reporting.listExpenseReportRows, {
        status: args.status,
        fromSubmittedAt: args.fromSubmittedAt,
        toSubmittedAt: args.toSubmittedAt,
        limit: args.limit,
      });

    const header = [
      "expenseId",
      "employeeId",
      "status",
      "amount",
      "currencyCode",
      "normalizedAmount",
      "normalizedCurrencyCode",
      "category",
      "expenseDate",
      "submittedAt",
      "matchedRuleId",
      "approvalMode",
    ];

    const csvRows = rows.map((row) =>
      [
        row.expenseId,
        row.employeeId,
        row.status,
        row.amount,
        row.currencyCode,
        row.normalizedAmount,
        row.normalizedCurrencyCode,
        row.category,
        row.expenseDate,
        row.submittedAt,
        row.matchedRuleId,
        row.approvalMode,
      ]
        .map((value) => csvEscape(value as string | number | null))
        .join(","),
    );

    const csv = [header.join(","), ...csvRows].join("\n");
    return {
      fileName: `expenses-export-${Date.now()}.csv`,
      csv,
      rowCount: rows.length,
    };
  },
});
