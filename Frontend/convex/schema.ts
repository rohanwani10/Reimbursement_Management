import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  companies: defineTable({
    name: v.string(),
    currency: v.string(),
  }),
  users: defineTable({
    company_id: v.id("companies"),
    clerkId: v.optional(v.string()), // For authentication mapping
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("manager"), v.literal("employee")),
    manager_id: v.optional(v.id("users")),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_company", ["company_id"]),
    
  approval_rules: defineTable({
    company_id: v.id("companies"),
    name: v.string(),
    category: v.optional(v.string()), // If undefined, applies to all
    amount_threshold: v.optional(v.number()), // If undefined, applies to any amount
    logic_type: v.union(
      v.literal("all"),
      v.literal("percentage"),
      v.literal("specific"),
      v.literal("hybrid")
    ),
    priority: v.number(), // Higher number = higher priority for conflict resolution
    manager_injection: v.boolean(),
    approval_mode: v.union(v.literal("sequential"), v.literal("parallel")),
    min_percentage: v.optional(v.number()), // For "percentage" or "hybrid"
    specific_approver_id: v.optional(v.id("users")), // For "specific" or "hybrid"
  }).index("by_company", ["company_id"]),

  rule_approvers: defineTable({
    rule_id: v.id("approval_rules"),
    user_id: v.id("users"),
    required: v.boolean(),
    sequence_order: v.number(),
  }).index("by_rule", ["rule_id"]),

  expenses: defineTable({
    company_id: v.id("companies"),
    user_id: v.id("users"),
    amount: v.number(),
    currency: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
    expense_date: v.optional(v.string()),
    paid_by: v.optional(v.string()),
    remarks: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    receipt_url: v.optional(v.string()),
    ocr_data: v.optional(
      v.object({
        extracted: v.any(),
        raw: v.any(),
        confidence: v.number(),
      })
    ),
    current_approver_index: v.optional(v.number()), // For sequential workflow tracking
    submitted_at: v.optional(v.number()),
    
    // Multi-currency handling
    base_currency: v.optional(v.string()),
    converted_amount: v.optional(v.number()),
    exchange_rate: v.optional(v.number()),
  })
    .index("by_company", ["company_id"])
    .index("by_user", ["user_id"]),

  expense_approvals: defineTable({
    expense_id: v.id("expenses"),
    user_id: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("skipped")
    ),
    step_order: v.number(),
    comments: v.optional(v.string()),
  }).index("by_expense", ["expense_id"]),

  activity_logs: defineTable({
    entity_type: v.string(), // e.g., "expense", "rule", "user"
    entity_id: v.string(), // Generic string to accommodate different IDs
    action: v.string(), // e.g., "submitted", "approved", "rejected", "overridden"
    actor_id: v.optional(v.id("users")), // User who performed the action
    metadata: v.optional(v.any()), // Contextual data
    created_at: v.optional(v.number()), // Specific timestamp, though Convex has _creationTime
  }).index("by_entity", ["entity_type", "entity_id"]),
});
