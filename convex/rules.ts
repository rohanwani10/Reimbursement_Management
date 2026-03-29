import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createRule = mutation({
  args: {
    company_id: v.id("companies"),
    name: v.string(),
    category: v.optional(v.string()),
    amount_threshold: v.optional(v.number()),
    logic_type: v.union(
      v.literal("all"),
      v.literal("percentage"),
      v.literal("specific"),
      v.literal("hybrid")
    ),
    priority: v.number(),
    manager_injection: v.boolean(),
    approval_mode: v.union(v.literal("sequential"), v.literal("parallel")),
    min_percentage: v.optional(v.number()),
    specific_approver_id: v.optional(v.id("users")),
    approvers: v.array(
      v.object({
        user_id: v.id("users"),
        required: v.boolean(),
        sequence_order: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { approvers, ...ruleData } = args;
    
    // Insert the main rule
    const ruleId = await ctx.db.insert("approval_rules", ruleData);

    // Insert rule approvers template
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
  args: { company_id: v.id("companies") },
  handler: async (ctx, args) => {
    const rules = await ctx.db
      .query("approval_rules")
      .withIndex("by_company", (q) => q.eq("company_id", args.company_id))
      .collect();
      
    // Fetch approvers for each rule
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
    const approvers = await ctx.db
      .query("rule_approvers")
      .withIndex("by_rule", (q) => q.eq("rule_id", args.rule_id))
      .collect();
    for (const app of approvers) {
      await ctx.db.delete(app._id);
    }
    await ctx.db.delete(args.rule_id);
  },
});

export const updateRule = mutation({
  args: {
    rule_id: v.id("approval_rules"),
    name: v.string(),
    category: v.optional(v.string()),
    amount_threshold: v.optional(v.number()),
    logic_type: v.union(v.literal("all"), v.literal("percentage"), v.literal("specific"), v.literal("hybrid")),
    priority: v.number(),
    manager_injection: v.boolean(),
    approval_mode: v.union(v.literal("sequential"), v.literal("parallel")),
    min_percentage: v.optional(v.number()),
    specific_approver_id: v.optional(v.id("users")),
    approvers: v.array(
      v.object({
        user_id: v.id("users"),
        required: v.boolean(),
        sequence_order: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { rule_id, approvers, ...ruleData } = args;
    
    await ctx.db.patch(rule_id, ruleData);

    const oldApprovers = await ctx.db
      .query("rule_approvers")
      .withIndex("by_rule", (q) => q.eq("rule_id", rule_id))
      .collect();
    for (const app of oldApprovers) {
      await ctx.db.delete(app._id);
    }

    for (const approver of approvers) {
      await ctx.db.insert("rule_approvers", {
        rule_id,
        user_id: approver.user_id,
        required: approver.required,
        sequence_order: approver.sequence_order,
      });
    }
  },
});
