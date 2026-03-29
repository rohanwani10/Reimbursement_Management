import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  companies: defineTable({
    name: v.string(),
    countryCode: v.string(),
    currencyCode: v.string(),
    currencySymbol: v.string(),
    createdByUserId: v.union(v.id("users"), v.null()),
    isActive: v.boolean(),
    bootstrapCompletedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  users: defineTable({
    companyId: v.id("companies"),
    clerkUserId: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("admin"), v.literal("manager"), v.literal("employee")),
    status: v.union(v.literal("active"), v.literal("inactive")),
    managerId: v.union(v.id("users"), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
    deactivatedAt: v.union(v.number(), v.null()),
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_companyId", ["companyId"])
    .index("by_companyId_and_email", ["companyId", "email"]),

  approvalRules: defineTable({
    companyId: v.id("companies"),
    name: v.string(),
    description: v.union(v.string(), v.null()),
    category: v.union(v.string(), v.null()),
    minAmount: v.number(),
    conditionType: v.union(
      v.literal("all"),
      v.literal("percentage"),
      v.literal("specific"),
      v.literal("hybrid"),
    ),
    requiredPercentage: v.union(v.number(), v.null()),
    specificApproverId: v.union(v.id("users"), v.null()),
    mode: v.union(v.literal("sequential"), v.literal("parallel")),
    includeManagerApprover: v.boolean(),
    allowAdminFallback: v.boolean(),
    priority: v.union(v.number(), v.null()),
    isActive: v.boolean(),
    createdByUserId: v.id("users"),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_companyId_and_isActive", ["companyId", "isActive"])
    .index("by_companyId_and_category", ["companyId", "category"]),

  approvalRuleApprovers: defineTable({
    companyId: v.id("companies"),
    ruleId: v.id("approvalRules"),
    approverId: v.id("users"),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ruleId", ["ruleId"])
    .index("by_ruleId_and_order", ["ruleId", "order"])
    .index("by_ruleId_and_approverId", ["ruleId", "approverId"]),

  expenses: defineTable({
    companyId: v.id("companies"),
    employeeId: v.id("users"),
    amount: v.union(v.number(), v.null()),
    currencyCode: v.union(v.string(), v.null()),
    normalizedAmount: v.union(v.number(), v.null()),
    normalizedCurrencyCode: v.union(v.string(), v.null()),
    exchangeRate: v.union(v.number(), v.null()),
    category: v.union(v.string(), v.null()),
    description: v.union(v.string(), v.null()),
    expenseDate: v.union(v.string(), v.null()),
    receiptRefs: v.array(v.string()),
    ocrRequestId: v.union(v.id("ocrRequests"), v.null()),
    status: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    matchedRuleId: v.union(v.id("approvalRules"), v.null()),
    approvalMode: v.union(v.literal("sequential"), v.literal("parallel"), v.null()),
    submittedAt: v.union(v.number(), v.null()),
    currentApprovalOrder: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_employeeId", ["employeeId"])
    .index("by_companyId_and_status", ["companyId", "status"])
    .index("by_companyId_and_submittedAt", ["companyId", "submittedAt"]),

  expenseApprovals: defineTable({
    companyId: v.id("companies"),
    expenseId: v.id("expenses"),
    approverId: v.id("users"),
    order: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("skipped"),
    ),
    comment: v.union(v.string(), v.null()),
    actedAt: v.union(v.number(), v.null()),
    decidedById: v.union(v.id("users"), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_expenseId", ["expenseId"])
    .index("by_expenseId_and_order", ["expenseId", "order"])
    .index("by_approverId_and_status", ["approverId", "status"]),

  expenseComments: defineTable({
    companyId: v.id("companies"),
    expenseId: v.id("expenses"),
    authorId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_expenseId", ["expenseId"])
    .index("by_companyId", ["companyId"]),

  activityLog: defineTable({
    companyId: v.id("companies"),
    actorId: v.id("users"),
    entityType: v.string(),
    entityId: v.string(),
    action: v.string(),
    metadata: v.union(v.any(), v.null()),
    createdAt: v.number(),
  })
    .index("by_companyId", ["companyId"])
    .index("by_entityType_and_entityId", ["entityType", "entityId"])
    .index("by_companyId_and_createdAt", ["companyId", "createdAt"]),

  notifications: defineTable({
    companyId: v.id("companies"),
    userId: v.id("users"),
    type: v.string(),
    title: v.string(),
    message: v.string(),
    payload: v.union(v.any(), v.null()),
    read: v.boolean(),
    readAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_read", ["userId", "read"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"]),

  ocrRequests: defineTable({
    companyId: v.id("companies"),
    expenseId: v.id("expenses"),
    requestedById: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed")),
    requestPayload: v.any(),
    responsePayload: v.union(v.any(), v.null()),
    errorMessage: v.union(v.string(), v.null()),
    requestedAt: v.number(),
    completedAt: v.union(v.number(), v.null()),
    updatedAt: v.number(),
  })
    .index("by_expenseId", ["expenseId"])
    .index("by_status", ["status"])
    .index("by_expenseId_and_status", ["expenseId", "status"]),
});
