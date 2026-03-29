import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Activity log helper
async function logActivity(
  ctx: any,
  entity_type: string,
  entity_id: string,
  action: string,
  actor_id?: any,
  metadata?: any
) {
  await ctx.db.insert("activity_logs", {
    entity_type,
    entity_id,
    action,
    actor_id,
    metadata,
    created_at: Date.now(),
  });
}

export const submitExpense = mutation({
  args: {
    company_id: v.id("companies"),
    user_id: v.id("users"),
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
    base_currency: v.optional(v.string()),
    converted_amount: v.optional(v.number()),
    exchange_rate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // 1. Create expense in pending status
    const expenseId = await ctx.db.insert("expenses", {
      ...args,
      status: "pending",
      submitted_at: Date.now(),
      current_approver_index: 0,
    });

    // 2. Log submission
    await logActivity(ctx, "expense", expenseId, "submitted", args.user_id);

    // 3. Find matching rules logic
    const rules = await ctx.db
      .query("approval_rules")
      .withIndex("by_company", (q) => q.eq("company_id", args.company_id))
      .collect();

    // Find the most specific, highest priority rule
    const matchingRule = rules
      .filter((r) => {
        const matchesCategory = r.category ? r.category === args.category : true;
        const matchesThreshold =
          r.amount_threshold !== undefined ? args.amount >= r.amount_threshold : true;
        return matchesCategory && matchesThreshold;
      })
      .sort((a, b) => b.priority - a.priority)[0]; // Highest priority first

    if (!matchingRule) {
      // If no rule matches, typically auto-assign to Admin or mark as draft/pending
      await logActivity(ctx, "expense", expenseId, "no_rule_found");
      return expenseId;
    }

    // 4. Build the approval chain based on the matched rule
    const submitter = await ctx.db.get(args.user_id);
    const ruleApprovers = await ctx.db
      .query("rule_approvers")
      .withIndex("by_rule", (q) => q.eq("rule_id", matchingRule._id))
      .collect();

    let finalApproversSet = new Map<string, any>();
    let currentStepOrder = 1;

    // Manager injection deduplication logic
    if (matchingRule.manager_injection && submitter && submitter.manager_id) {
      finalApproversSet.set(submitter.manager_id, {
        user_id: submitter.manager_id,
        status: "pending",
        step_order: currentStepOrder++,
      });
    }

    // Add rule approvers, ensuring no duplicates
    const sortedApprovers = ruleApprovers.sort((a, b) => a.sequence_order - b.sequence_order);

    for (const approver of sortedApprovers) {
      if (!finalApproversSet.has(approver.user_id)) {
        finalApproversSet.set(approver.user_id, {
          user_id: approver.user_id,
          status: "pending",
          step_order: matchingRule.approval_mode === "sequential" ? currentStepOrder++ : 1, // all parallel have step 1
        });
      }
    }

    // Insert the generated approvals chain
    const approverArray = Array.from(finalApproversSet.values());
    for (const app of approverArray) {
      await ctx.db.insert("expense_approvals", {
        expense_id: expenseId,
        user_id: app.user_id,
        status: app.status,
        step_order: app.step_order,
      });
    }

    await logActivity(ctx, "expense", expenseId, "approval_chain_generated", undefined, {
      rule_id: matchingRule._id,
      approvers_count: approverArray.length,
    });

    return expenseId;
  },
});

export const getAllExpenses = query({
  args: { company_id: v.id("companies") },
  handler: async (ctx, args) => {
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_company", (q) => q.eq("company_id", args.company_id))
      .order("desc") // default uses _creationTime
      .collect();
    
    // Fetch submitter names and approvals
    return await Promise.all(expenses.map(async (exp) => {
      const user = await ctx.db.get(exp.user_id);
      const approvals = await ctx.db
        .query("expense_approvals")
        .withIndex("by_expense", (q) => q.eq("expense_id", exp._id))
        .collect();
      
      const approversWithNames = await Promise.all(approvals.map(async (app) => {
        const approverUser = await ctx.db.get(app.user_id);
        return { ...app, name: approverUser?.name };
      }));
      
      return {
        ...exp,
        submitter_name: user?.name,
        approvers: approversWithNames.sort((a,b) => a.step_order - b.step_order),
      };
    }));
  },
});

export const overrideExpense = mutation({
  args: {
    expense_id: v.id("expenses"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    admin_id: v.id("users"),
    comments: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { expense_id, status, admin_id, comments } = args;
    await ctx.db.patch(expense_id, { status });

    await logActivity(ctx, "expense", expense_id, "admin_override_" + status, admin_id, {
      comments,
    });

    // Skip pending approvals
    const pendingApprovals = await ctx.db
      .query("expense_approvals")
      .withIndex("by_expense", (q) => q.eq("expense_id", expense_id))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    for (const app of pendingApprovals) {
      await ctx.db.patch(app._id, { status: "skipped" });
    }
  },
});
