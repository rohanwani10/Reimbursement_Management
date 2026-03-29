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
const DEFAULT_PROVIDER = "paddleocr-local";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;

type OcrWorkerRequestPayload = {
  requestId: string;
  expenseId: string;
  receiptUrl: string;
  mimeType: string;
  hints: {
    companyCurrency: string;
    locale: string | null;
  };
};

type OcrWorkerLineItem = {
  description: string;
  amount: number | null;
  quantity: number | null;
};

type OcrWorkerNormalizedResult = {
  requestId: string;
  status: "completed" | "failed";
  rawText: string;
  merchant: string | null;
  amount: number | null;
  currencyCode: string | null;
  expenseDate: string | null;
  lineItems: OcrWorkerLineItem[];
  confidence: number;
  warnings: string[];
  providerMetadata: Record<string, unknown>;
  errorMessage: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("INVALID_STATE", "OCR service returned an invalid payload shape.");
  }
  return value as Record<string, unknown>;
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    fail("INVALID_STATE", "OCR response field is expected to be a string.");
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    fail("INVALID_STATE", "OCR response field is expected to be a finite number.");
  }
  return value;
}

function toStringArray(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail("INVALID_STATE", "OCR warnings must be an array.");
  }
  return value.map((item) => {
    if (typeof item !== "string") {
      fail("INVALID_STATE", "OCR warning entries must be strings.");
    }
    return item;
  });
}

function normalizeLineItems(value: unknown): OcrWorkerLineItem[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    fail("INVALID_STATE", "OCR lineItems must be an array.");
  }

  return value.map((item) => {
    const record = asRecord(item);
    const description = toNullableString(record.description);
    if (!description) {
      fail("INVALID_STATE", "OCR lineItems entries must include description.");
    }

    return {
      description,
      amount: toNullableNumber(record.amount),
      quantity: toNullableNumber(record.quantity),
    };
  });
}

function normalizeWorkerResponse(payload: unknown): OcrWorkerNormalizedResult {
  const record = asRecord(payload);
  const requestId = toNullableString(record.requestId);
  const status = toNullableString(record.status);

  if (!requestId) {
    fail("INVALID_STATE", "OCR response missing requestId.");
  }
  if (status !== "completed" && status !== "failed") {
    fail("INVALID_STATE", "OCR response has invalid status.");
  }

  const confidence = toNullableNumber(record.confidence);

  return {
    requestId,
    status,
    rawText: toNullableString(record.rawText) ?? "",
    merchant: toNullableString(record.merchant),
    amount: toNullableNumber(record.amount),
    currencyCode: toNullableString(record.currencyCode),
    expenseDate: toNullableString(record.expenseDate),
    lineItems: normalizeLineItems(record.lineItems),
    confidence: confidence ?? 0,
    warnings: toStringArray(record.warnings),
    providerMetadata:
      record.providerMetadata &&
      typeof record.providerMetadata === "object" &&
      !Array.isArray(record.providerMetadata)
        ? (record.providerMetadata as Record<string, unknown>)
        : {},
    errorMessage: toNullableString(record.errorMessage),
  };
}

function buildOcrEndpoint() {
  const baseUrl = process.env.OCR_SERVICE_URL?.trim();
  if (!baseUrl) {
    fail("INVALID_STATE", "OCR_SERVICE_URL is not configured.");
  }
  return new URL(OCR_ENDPOINT_PATH, baseUrl).toString();
}

function getProviderName() {
  const provider = process.env.OCR_PROVIDER_NAME?.trim();
  return provider && provider.length > 0 ? provider : DEFAULT_PROVIDER;
}

function getTimeoutMs() {
  const raw = process.env.OCR_REQUEST_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.floor(parsed);
}

function getMaxAttempts() {
  const raw = process.env.OCR_MAX_ATTEMPTS;
  if (!raw) {
    return DEFAULT_MAX_ATTEMPTS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_MAX_ATTEMPTS;
  }
  return Math.floor(parsed);
}

function inferMimeType(receiptUrl: string) {
  const normalized = receiptUrl.toLowerCase();
  if (normalized.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (normalized.endsWith(".png")) {
    return "image/png";
  }
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }
  return "application/octet-stream";
}

async function requireActorFromToken(
  ctx: MutationCtx,
  tokenIdentifier: string,
) {
  const actors = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", tokenIdentifier))
    .take(2);

  if (actors.length === 0) {
    fail("FORBIDDEN", "Authenticated identity is not provisioned.");
  }
  if (actors.length > 1) {
    fail("CONFLICT", "Multiple actors found for authenticated identity.");
  }

  const actor = actors[0];
  if (actor.status !== "active") {
    fail("FORBIDDEN", "Inactive users cannot request OCR extraction.");
  }

  return actor;
}

async function getLatestRequestByStatus(
  ctx: MutationCtx,
  expenseId: Id<"expenses">,
  status: "pending" | "processing",
) {
  const rows = await ctx.db
    .query("ocrRequests")
    .withIndex("by_expenseId_and_status", (q) =>
      q.eq("expenseId", expenseId).eq("status", status),
    )
    .order("desc")
    .take(1);

  return rows[0] ?? null;
}

export const createOcrRequestInternal = internalMutation({
  args: {
    expenseId: v.id("expenses"),
    hints: v.optional(
      v.object({
        companyCurrency: v.optional(v.string()),
        locale: v.optional(v.string()),
        mimeType: v.optional(v.string()),
      }),
    ),
    forceNew: v.optional(v.boolean()),
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

    if (!args.forceNew) {
      const processing = await getLatestRequestByStatus(ctx, expense._id, "processing");
      if (processing) {
        return {
          ocrRequestId: processing._id,
          requestPayload: processing.requestPayload as OcrWorkerRequestPayload,
          status: processing.status,
          shouldDispatch: false,
          reused: true,
        };
      }

      const pending = await getLatestRequestByStatus(ctx, expense._id, "pending");
      if (pending) {
        return {
          ocrRequestId: pending._id,
          requestPayload: pending.requestPayload as OcrWorkerRequestPayload,
          status: pending.status,
          shouldDispatch: true,
          reused: true,
        };
      }
    }

    const receiptUrl = expense.receiptRefs[0] ?? null;
    if (!receiptUrl) {
      fail("VALIDATION_ERROR", "Expense must include at least one receipt reference for OCR.");
    }

    const provider = getProviderName();
    const requestId = `ocr_req_${expense._id}_${Date.now()}`;
    const mimeType = args.hints?.mimeType?.trim() || inferMimeType(receiptUrl);

    const requestPayload: OcrWorkerRequestPayload = {
      requestId,
      expenseId: expense._id,
      receiptUrl,
      mimeType,
      hints: {
        companyCurrency:
          args.hints?.companyCurrency ??
          expense.normalizedCurrencyCode ??
          expense.currencyCode ??
          "INR",
        locale: args.hints?.locale ?? null,
      },
    };

    const now = Date.now();
    const ocrRequestId = await ctx.db.insert("ocrRequests", {
      companyId: actor.companyId,
      expenseId: expense._id,
      requestedById: actor._id,
      status: "pending",
      requestPayload,
      responsePayload: null,
      errorMessage: null,
      provider,
      attemptCount: 0,
      requestedAt: now,
      startedAt: null,
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
        requestId,
        provider,
      },
      createdAt: now,
    });

    return {
      ocrRequestId,
      requestPayload,
      status: "pending" as const,
      shouldDispatch: true,
      reused: false,
    };
  },
});

export const markOcrRequestProcessingInternal = internalMutation({
  args: {
    ocrRequestId: v.id("ocrRequests"),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActorFromToken(ctx, args.tokenIdentifier);
    const request = await ctx.db.get(args.ocrRequestId);
    assertOrFail(request, "NOT_FOUND", "OCR request not found.");
    requireSameCompany(request.companyId, actor.companyId);

    if (request.status === "completed" || request.status === "failed") {
      fail("INVALID_STATE", "Cannot process an OCR request that is already finalized.");
    }

    if (request.status === "processing") {
      return {
        ocrRequestId: request._id,
        status: request.status,
        attemptCount: request.attemptCount,
        changed: false,
      };
    }

    const maxAttempts = getMaxAttempts();
    if (request.attemptCount >= maxAttempts) {
      fail("CONFLICT", "OCR request reached max retry attempts.", {
        maxAttempts,
      });
    }

    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: "processing",
      attemptCount: request.attemptCount + 1,
      startedAt: now,
      errorMessage: null,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.companyId,
      actorId: actor._id,
      entityType: "ocrRequest",
      entityId: request._id,
      action: "ocr.request_processing",
      metadata: {
        attemptCount: request.attemptCount + 1,
      },
      createdAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.companyId,
      actorId: actor._id,
      entityType: "ocrRequest",
      entityId: request._id,
      action: "ocr.request_sent",
      metadata: {
        attemptCount: request.attemptCount + 1,
      },
      createdAt: now,
    });

    return {
      ocrRequestId: request._id,
      status: "processing" as const,
      attemptCount: request.attemptCount + 1,
      changed: true,
    };
  },
});

export const completeOcrRequestInternal = internalMutation({
  args: {
    ocrRequestId: v.id("ocrRequests"),
    responsePayload: v.any(),
    normalized: v.object({
      merchant: v.union(v.string(), v.null()),
      amount: v.union(v.number(), v.null()),
      currencyCode: v.union(v.string(), v.null()),
      expenseDate: v.union(v.string(), v.null()),
      confidence: v.number(),
      warnings: v.array(v.string()),
    }),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActorFromToken(ctx, args.tokenIdentifier);
    const request = await ctx.db.get(args.ocrRequestId);
    assertOrFail(request, "NOT_FOUND", "OCR request not found.");
    requireSameCompany(request.companyId, actor.companyId);

    if (request.status === "completed") {
      return {
        ocrRequestId: request._id,
        status: request.status,
        changed: false,
      };
    }

    if (request.status === "failed") {
      fail("INVALID_STATE", "Cannot complete an OCR request that already failed.");
    }

    const expense = await ctx.db.get(request.expenseId);
    assertOrFail(expense, "NOT_FOUND", "Expense for OCR request not found.");
    requireSameCompany(expense.companyId, actor.companyId);

    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: "completed",
      responsePayload: args.responsePayload,
      errorMessage: null,
      completedAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(expense._id, {
      ocrRequestId: request._id,
      ocrMerchant: args.normalized.merchant,
      ocrAmount: args.normalized.amount,
      ocrCurrencyCode: args.normalized.currencyCode,
      ocrExpenseDate: args.normalized.expenseDate,
      ocrConfidence: args.normalized.confidence,
      ocrWarnings: args.normalized.warnings,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.companyId,
      actorId: actor._id,
      entityType: "ocrRequest",
      entityId: request._id,
      action: "ocr.request_completed",
      metadata: {
        expenseId: request.expenseId,
      },
      createdAt: now,
    });

    return {
      ocrRequestId: request._id,
      status: "completed" as const,
      changed: true,
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

    if (request.status === "failed") {
      return {
        ocrRequestId: request._id,
        status: request.status,
        changed: false,
      };
    }

    if (request.status === "completed") {
      fail("INVALID_STATE", "Cannot fail an OCR request that is already completed.");
    }

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
      changed: true,
    };
  },
});

export const requestOcrExtraction = action({
  args: {
    expenseId: v.id("expenses"),
    hints: v.optional(
      v.object({
        companyCurrency: v.optional(v.string()),
        locale: v.optional(v.string()),
        mimeType: v.optional(v.string()),
      }),
    ),
    forceNew: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.tokenIdentifier) {
      fail("UNAUTHORIZED", "Authentication is required.");
    }

    const created: {
      ocrRequestId: Id<"ocrRequests">;
      requestPayload: OcrWorkerRequestPayload;
      status: "pending" | "processing" | "completed" | "failed";
      shouldDispatch: boolean;
      reused: boolean;
    } = await ctx.runMutation(internal.ocr.createOcrRequestInternal, {
      expenseId: args.expenseId,
      hints: args.hints,
      forceNew: args.forceNew,
      tokenIdentifier: identity.tokenIdentifier,
    });

    if (!created.shouldDispatch) {
      return {
        ocrRequestId: created.ocrRequestId,
        status: created.status,
        reused: created.reused,
        dispatched: false,
      };
    }

    await ctx.runMutation(internal.ocr.markOcrRequestProcessingInternal, {
      ocrRequestId: created.ocrRequestId,
      tokenIdentifier: identity.tokenIdentifier,
    });

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), getTimeoutMs());
    const endpoint = buildOcrEndpoint();

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(created.requestPayload),
        signal: abortController.signal,
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
          reused: created.reused,
          dispatched: true,
        };
      }

      const rawResponse: unknown = await response.json();
      const normalized = normalizeWorkerResponse(rawResponse);

      if (normalized.requestId !== created.requestPayload.requestId) {
        await ctx.runMutation(internal.ocr.failOcrRequestInternal, {
          ocrRequestId: created.ocrRequestId,
          errorMessage:
            "OCR response requestId does not match the dispatched OCR request.",
          responsePayload: rawResponse,
          tokenIdentifier: identity.tokenIdentifier,
        });

        return {
          ocrRequestId: created.ocrRequestId,
          status: "failed" as const,
          reused: created.reused,
          dispatched: true,
        };
      }

      if (normalized.status === "failed") {
        await ctx.runMutation(internal.ocr.failOcrRequestInternal, {
          ocrRequestId: created.ocrRequestId,
          errorMessage:
            normalized.errorMessage ??
            (normalized.warnings.join("; ") || "OCR service reported failure"),
          responsePayload: rawResponse,
          tokenIdentifier: identity.tokenIdentifier,
        });

        return {
          ocrRequestId: created.ocrRequestId,
          status: "failed" as const,
          reused: created.reused,
          dispatched: true,
        };
      }

      await ctx.runMutation(internal.ocr.completeOcrRequestInternal, {
        ocrRequestId: created.ocrRequestId,
        responsePayload: rawResponse,
        normalized: {
          merchant: normalized.merchant,
          amount: normalized.amount,
          currencyCode: normalized.currencyCode,
          expenseDate: normalized.expenseDate,
          confidence: normalized.confidence,
          warnings: normalized.warnings,
        },
        tokenIdentifier: identity.tokenIdentifier,
      });

      return {
        ocrRequestId: created.ocrRequestId,
        status: "completed" as const,
        reused: created.reused,
        dispatched: true,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown OCR dispatch error";

      await ctx.runMutation(internal.ocr.failOcrRequestInternal, {
        ocrRequestId: created.ocrRequestId,
        errorMessage: message,
        responsePayload: null,
        tokenIdentifier: identity.tokenIdentifier,
      });

      return {
        ocrRequestId: created.ocrRequestId,
        status: "failed" as const,
        reused: created.reused,
        dispatched: true,
      };
    } finally {
      clearTimeout(timeoutId);
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
