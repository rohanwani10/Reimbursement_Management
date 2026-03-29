import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { action, internalMutation, query } from "./_generated/server";
import { QUERY_HARD_LIMIT } from "./constants";
import { requireAuth } from "./lib/auth";
import { logActivity } from "./lib/activity";
import { assertOrFail, fail } from "./lib/errors";
import { requireSameCompany } from "./lib/tenancy";

const OCR_ENDPOINT_PATH = "/ocr/extract";

function buildOcrEndpoint() {
  const baseUrl = process.env.OCR_SERVICE_URL?.trim();
  if (!baseUrl) {
    fail("INVALID_STATE", "OCR_SERVICE_URL is not configured.");
  }
  return new URL(OCR_ENDPOINT_PATH, baseUrl).toString();
}

async function requireActorFromToken(
  ctx: MutationCtx,
  tokenIdentifier: string,
) {
  const actor = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", tokenIdentifier))
    .unique();

  if (!actor) {
    fail("FORBIDDEN", "Authenticated identity is not provisioned.");
  }
  if (actor.status !== "active") {
    fail("FORBIDDEN", "Inactive users cannot request OCR extraction.");
  }

  return actor;
}

export const createOcrRequestInternal = internalMutation({
  args: {
    expenseId: v.id("expenses"),
    hints: v.optional(
      v.object({
        currencyCode: v.optional(v.string()),
        locale: v.optional(v.string()),
      }),
    ),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActorFromToken(ctx, args.tokenIdentifier);
    const expense = await ctx.db.get(args.expenseId);
    assertOrFail(expense, "NOT_FOUND", "Expense not found.");
    requireSameCompany(expense.companyId, actor.companyId);

    const isOwner = expense.employeeId === actor._id;
    const isAdmin = actor.role === "admin";
    const isManager = actor.role === "manager";
    if (!isOwner && !isAdmin && !isManager) {
      fail("FORBIDDEN", "You are not allowed to request OCR for this expense.");
    }

    const endpoint = buildOcrEndpoint();
    const now = Date.now();
    const requestPayload = {
      expenseId: expense._id,
      receiptUrl: expense.receiptRefs[0] ?? null,
      hints: {
        currencyCode: args.hints?.currencyCode ?? expense.currencyCode,
        locale: args.hints?.locale ?? null,
      },
    };

    if (!requestPayload.receiptUrl) {
      fail("VALIDATION_ERROR", "Expense must include at least one receipt reference for OCR.");
    }

    const ocrRequestId = await ctx.db.insert("ocrRequests", {
      companyId: actor.companyId,
      expenseId: expense._id,
      requestedById: actor._id,
      status: "pending",
      requestPayload,
      responsePayload: null,
      errorMessage: null,
      requestedAt: now,
      completedAt: null,
      updatedAt: now,
    });

    await ctx.db.patch(expense._id, {
      ocrRequestId,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.companyId,
      actorId: actor._id,
      entityType: "ocrRequest",
      entityId: ocrRequestId,
      action: "ocr.request_created",
      metadata: {
        expenseId: expense._id,
      },
      createdAt: now,
    });

    return {
      ocrRequestId,
      endpoint,
      requestPayload,
      companyId: actor.companyId,
      actorId: actor._id,
    };
  },
});

export const completeOcrRequestInternal = internalMutation({
  args: {
    ocrRequestId: v.id("ocrRequests"),
    responsePayload: v.any(),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActorFromToken(ctx, args.tokenIdentifier);
    const request = await ctx.db.get(args.ocrRequestId);
    assertOrFail(request, "NOT_FOUND", "OCR request not found.");
    requireSameCompany(request.companyId, actor.companyId);

    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: "completed",
      responsePayload: args.responsePayload,
      errorMessage: null,
      completedAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.companyId,
      actorId: actor._id,
      entityType: "ocrRequest",
      entityId: request._id,
      action: "ocr.request_completed",
      metadata: null,
      createdAt: now,
    });

    return {
      ocrRequestId: request._id,
      status: "completed" as const,
    };
  },
});

export const failOcrRequestInternal = internalMutation({
  args: {
    ocrRequestId: v.id("ocrRequests"),
    errorMessage: v.string(),
    responsePayload: v.optional(v.any()),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActorFromToken(ctx, args.tokenIdentifier);
    const request = await ctx.db.get(args.ocrRequestId);
    assertOrFail(request, "NOT_FOUND", "OCR request not found.");
    requireSameCompany(request.companyId, actor.companyId);

    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: "failed",
      responsePayload: args.responsePayload ?? null,
      errorMessage: args.errorMessage,
      completedAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.companyId,
      actorId: actor._id,
      entityType: "ocrRequest",
      entityId: request._id,
      action: "ocr.request_failed",
      metadata: {
        errorMessage: args.errorMessage,
      },
      createdAt: now,
    });

    return {
      ocrRequestId: request._id,
      status: "failed" as const,
    };
  },
});

export const requestOcrExtraction = action({
  args: {
    expenseId: v.id("expenses"),
    hints: v.optional(
      v.object({
        currencyCode: v.optional(v.string()),
        locale: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.tokenIdentifier) {
      fail("UNAUTHORIZED", "Authentication is required.");
    }

    const created: {
      ocrRequestId: Id<"ocrRequests">;
      endpoint: string;
      requestPayload: unknown;
    } = await ctx.runMutation(internal.ocr.createOcrRequestInternal, {
      expenseId: args.expenseId,
      hints: args.hints,
      tokenIdentifier: identity.tokenIdentifier,
    });

    try {
      const response = await fetch(created.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(created.requestPayload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        await ctx.runMutation(internal.ocr.failOcrRequestInternal, {
          ocrRequestId: created.ocrRequestId,
          errorMessage: `OCR endpoint returned ${response.status}: ${errorBody}`,
          responsePayload: {
            status: response.status,
            body: errorBody,
          },
          tokenIdentifier: identity.tokenIdentifier,
        });
        return {
          ocrRequestId: created.ocrRequestId,
          status: "failed" as const,
        };
      }

      const responsePayload: unknown = await response.json();
      await ctx.runMutation(internal.ocr.completeOcrRequestInternal, {
        ocrRequestId: created.ocrRequestId,
        responsePayload,
        tokenIdentifier: identity.tokenIdentifier,
      });

      return {
        ocrRequestId: created.ocrRequestId,
        status: "completed" as const,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown OCR error";

      await ctx.runMutation(internal.ocr.failOcrRequestInternal, {
        ocrRequestId: created.ocrRequestId,
        errorMessage: message,
        responsePayload: null,
        tokenIdentifier: identity.tokenIdentifier,
      });

      return {
        ocrRequestId: created.ocrRequestId,
        status: "failed" as const,
      };
    }
  },
});

export const listExpenseOcrRequests = query({
  args: {
    expenseId: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuth(ctx);
    const expense = await ctx.db.get(args.expenseId);
    assertOrFail(expense, "NOT_FOUND", "Expense not found.");
    requireSameCompany(expense.companyId, actor.company._id);

    const isOwner = expense.employeeId === actor.user._id;
    const isPrivileged = actor.user.role === "admin" || actor.user.role === "manager";

    if (!isOwner && !isPrivileged) {
      fail("FORBIDDEN", "You are not allowed to view OCR requests for this expense.");
    }

    return await ctx.db
      .query("ocrRequests")
      .withIndex("by_expenseId", (q) => q.eq("expenseId", args.expenseId))
      .order("desc")
      .take(QUERY_HARD_LIMIT);
  },
});
