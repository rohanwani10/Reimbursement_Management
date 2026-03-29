import { v } from "convex/values";

import { query } from "./_generated/server";
import { QUERY_HARD_LIMIT, REPORT_DEFAULT_LIMIT } from "./constants";
import { requireAdmin } from "./security/auth";

type ReportRow = {
  expense_id: string;
  user_id: string;
  status: "draft" | "pending" | "approved" | "rejected";
  amount: number;
  currency: string;
  converted_amount: number | null;
  base_currency: string | null;
  category: string;
  expense_date: string | null;
  submitted_at: number | null;
};

function csvEscape(value: string | number | null) {
  if (value === null) {
    return "";
  }

  const text = String(value);
  if (!text.includes(",") && !text.includes("\n") && !text.includes('"')) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

function withinSubmittedRange(
  submittedAt: number | undefined,
  fromSubmittedAt: number | null,
  toSubmittedAt: number | null
) {
  if (submittedAt === undefined) {
    return false;
  }

  if (fromSubmittedAt !== null && submittedAt < fromSubmittedAt) {
    return false;
  }
  if (toSubmittedAt !== null && submittedAt > toSubmittedAt) {
    return false;
  }
  return true;
}

export const listExpenseReportRows = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected")
      )
    ),
    fromSubmittedAt: v.optional(v.union(v.number(), v.null())),
    toSubmittedAt: v.optional(v.union(v.number(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const fromSubmittedAt = args.fromSubmittedAt ?? null;
    const toSubmittedAt = args.toSubmittedAt ?? null;
    const limit = Math.max(1, Math.min(args.limit ?? REPORT_DEFAULT_LIMIT, QUERY_HARD_LIMIT));

    const baseRows = await ctx.db
      .query("expenses")
      .withIndex("by_company", (q) => q.eq("company_id", actor.company_id))
      .order("desc")
      .take(Math.min(limit * 3, QUERY_HARD_LIMIT));

    const filtered = baseRows
      .filter((row) => (args.status ? row.status === args.status : true))
      .filter((row) => withinSubmittedRange(row.submitted_at, fromSubmittedAt, toSubmittedAt))
      .slice(0, limit);

    return filtered.map((row) => ({
      expense_id: row._id,
      user_id: row.user_id,
      status: row.status,
      amount: row.amount,
      currency: row.currency,
      converted_amount: row.converted_amount ?? null,
      base_currency: row.base_currency ?? null,
      category: row.category,
      expense_date: row.expense_date ?? null,
      submitted_at: row.submitted_at ?? null,
    }));
  },
});

export const approvalTurnaroundSummary = query({
  args: {
    fromSubmittedAt: v.optional(v.union(v.number(), v.null())),
    toSubmittedAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const fromSubmittedAt = args.fromSubmittedAt ?? null;
    const toSubmittedAt = args.toSubmittedAt ?? null;

    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_company", (q) => q.eq("company_id", actor.company_id))
      .take(QUERY_HARD_LIMIT);

    const terminal = expenses.filter(
      (expense) =>
        (expense.status === "approved" || expense.status === "rejected") &&
        withinSubmittedRange(expense.submitted_at, fromSubmittedAt, toSubmittedAt)
    );

    const durations: number[] = [];

    for (const expense of terminal) {
      if (expense.submitted_at === undefined) {
        continue;
      }

      const approvals = await ctx.db
        .query("expense_approvals")
        .withIndex("by_expense", (q) => q.eq("expense_id", expense._id))
        .take(QUERY_HARD_LIMIT);

      const completionTimes = approvals
        .filter((approval) => approval.status !== "pending")
        .map((approval) => approval._creationTime);

      if (completionTimes.length === 0) {
        continue;
      }

      const completedAt = Math.max(...completionTimes);
      durations.push(completedAt - expense.submitted_at);
    }

    if (durations.length === 0) {
      return {
        count: 0,
        average_ms: null,
        max_ms: null,
        min_ms: null,
      };
    }

    const total = durations.reduce((sum, value) => sum + value, 0);

    return {
      count: durations.length,
      average_ms: Math.round(total / durations.length),
      max_ms: Math.max(...durations),
      min_ms: Math.min(...durations),
    };
  },
});

export const exportExpensesCsv = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected")
      )
    ),
    fromSubmittedAt: v.optional(v.union(v.number(), v.null())),
    toSubmittedAt: v.optional(v.union(v.number(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const fromSubmittedAt = args.fromSubmittedAt ?? null;
    const toSubmittedAt = args.toSubmittedAt ?? null;
    const limit = Math.max(1, Math.min(args.limit ?? REPORT_DEFAULT_LIMIT, QUERY_HARD_LIMIT));

    const baseRows = await ctx.db
      .query("expenses")
      .withIndex("by_company", (q) => q.eq("company_id", actor.company_id))
      .order("desc")
      .take(Math.min(limit * 3, QUERY_HARD_LIMIT));

    const rows: ReportRow[] = baseRows
      .filter((row) => (args.status ? row.status === args.status : true))
      .filter((row) => withinSubmittedRange(row.submitted_at, fromSubmittedAt, toSubmittedAt))
      .slice(0, limit)
      .map((row) => ({
        expense_id: row._id,
        user_id: row.user_id,
        status: row.status,
        amount: row.amount,
        currency: row.currency,
        converted_amount: row.converted_amount ?? null,
        base_currency: row.base_currency ?? null,
        category: row.category,
        expense_date: row.expense_date ?? null,
        submitted_at: row.submitted_at ?? null,
      }));

    const header = [
      "expense_id",
      "user_id",
      "status",
      "amount",
      "currency",
      "converted_amount",
      "base_currency",
      "category",
      "expense_date",
      "submitted_at",
    ];

    const csvRows = rows.map((row) =>
      [
        row.expense_id,
        row.user_id,
        row.status,
        row.amount,
        row.currency,
        row.converted_amount,
        row.base_currency,
        row.category,
        row.expense_date,
        row.submitted_at,
      ]
        .map((value) => csvEscape(value as string | number | null))
        .join(",")
    );

    return {
      file_name: `expenses-export-${Date.now()}.csv`,
      csv: [header.join(","), ...csvRows].join("\n"),
      row_count: rows.length,
    };
  },
});
