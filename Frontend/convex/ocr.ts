import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { QUERY_HARD_LIMIT } from "./constants";
import { requireActor } from "./security/auth";
import { fail } from "./security/errors";

const OCR_ENDPOINT_PATH = "/ocr/extract";
const DEFAULT_PROVIDER = "fastapi-paddleocr";
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

export type OcrWorkerNormalizedResult = {
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

export function normalizeWorkerResponse(payload: unknown): OcrWorkerNormalizedResult {
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

export function inferMimeType(receiptUrl: string, fallbackMimeType?: string) {
  if (fallbackMimeType && fallbackMimeType.trim().length > 0) {
    return fallbackMimeType.trim().toLowerCase();
  }

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

async function requireActorFromSubject(ctx: MutationCtx, identitySubject: string) {
  const actor = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identitySubject))
    .unique();

  if (!actor) {
    fail("FORBIDDEN", "Authenticated identity is not provisioned.");
  }

  return actor;
}

async function getLatestRequestByStatus(
  ctx: MutationCtx,
  expenseId: Id<"expenses">,
  status: "pending" | "processing"
) {
  const rows = await ctx.db
    .query("ocr_requests")
    .withIndex("by_expense_and_status", (q) =>
      q.eq("expense_id", expenseId).eq("status", status)
    )
    .order("desc")
    .take(1);

  return rows[0] ?? null;
}

async function dispatchToOcrService(payload: OcrWorkerRequestPayload) {
  const endpoint = buildOcrEndpoint();
  const timeoutMs = getTimeoutMs();
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      fail("INVALID_STATE", `OCR endpoint returned ${response.status}: ${body}`);
    }

    const rawResponse: unknown = await response.json();
    return {
      rawResponse,
      normalized: normalizeWorkerResponse(rawResponse),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const processReceipt = action({
  args: {
    storageId: v.id("_storage"),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const url = await ctx.storage.getUrl(args.storageId);

    if (!url) {
      fail("NOT_FOUND", "Unable to retrieve file URL from storage.");
    }

    const requestPayload: OcrWorkerRequestPayload = {
      requestId: `preview_${args.storageId}_${Date.now()}`,
      expenseId: "preview",
      receiptUrl: url,
      mimeType: inferMimeType(url, args.mimeType),
      hints: {
        companyCurrency: "USD",
        locale: null,
      },
    };

    const { rawResponse, normalized } = await dispatchToOcrService(requestPayload);

    if (normalized.status === "failed") {
      return {
        success: false,
        receipt_url: url,
        extracted: {},
        raw: rawResponse,
        confidence: normalized.confidence,
      };
    }

    return {
      success: true,
      receipt_url: url,
      extracted: {
        amount: normalized.amount ?? undefined,
        currency: normalized.currencyCode ?? undefined,
        expense_date: normalized.expenseDate ?? undefined,
        description: normalized.merchant ?? undefined,
      },
      raw: rawResponse,
      confidence: normalized.confidence,
    };
  },
});

export const createOcrRequestInternal = internalMutation({
  args: {
    expense_id: v.id("expenses"),
    hints: v.optional(
      v.object({
        company_currency: v.optional(v.string()),
        locale: v.optional(v.string()),
        mime_type: v.optional(v.string()),
      })
    ),
    force_new: v.optional(v.boolean()),
    identity_subject: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActorFromSubject(ctx, args.identity_subject);
    const expense = await ctx.db.get(args.expense_id);
    if (!expense) {
      fail("NOT_FOUND", "Expense not found.");
    }
    if (expense.company_id !== actor.company_id) {
      fail("FORBIDDEN", "Expense belongs to another company.");
    }

    const isOwner = expense.user_id === actor._id;
    const isPrivileged = actor.role === "admin" || actor.role === "manager";
    if (!isOwner && !isPrivileged) {
      fail("FORBIDDEN", "You are not allowed to request OCR for this expense.");
    }

    if (!args.force_new) {
      const processing = await getLatestRequestByStatus(ctx, expense._id, "processing");
      if (processing) {
        return {
          ocr_request_id: processing._id,
          request_payload: processing.request_payload as OcrWorkerRequestPayload,
          status: processing.status,
          should_dispatch: false,
          reused: true,
        };
      }

      const pending = await getLatestRequestByStatus(ctx, expense._id, "pending");
      if (pending) {
        return {
          ocr_request_id: pending._id,
          request_payload: pending.request_payload as OcrWorkerRequestPayload,
          status: pending.status,
          should_dispatch: true,
          reused: true,
        };
      }
    }

    if (!expense.receipt_url) {
      fail("VALIDATION_ERROR", "Expense must include a receipt_url for OCR extraction.");
    }

    const company = await ctx.db.get(actor.company_id);
    if (!company) {
      fail("NOT_FOUND", "Actor company not found.");
    }

    const provider = getProviderName();
    const requestId = `ocr_req_${expense._id}_${Date.now()}`;

    const requestPayload: OcrWorkerRequestPayload = {
      requestId,
      expenseId: expense._id,
      receiptUrl: expense.receipt_url,
      mimeType: inferMimeType(expense.receipt_url, args.hints?.mime_type),
      hints: {
        companyCurrency:
          args.hints?.company_currency ?? expense.currency ?? company.currency ?? "USD",
        locale: args.hints?.locale ?? null,
      },
    };

    const now = Date.now();
    const ocrRequestId = await ctx.db.insert("ocr_requests", {
      company_id: actor.company_id,
      expense_id: expense._id,
      requested_by_id: actor._id,
      status: "pending",
      request_payload: requestPayload,
      response_payload: null,
      error_message: undefined,
      provider,
      attempt_count: 0,
      requested_at: now,
      started_at: undefined,
      completed_at: undefined,
      updated_at: now,
    });

    await ctx.db.patch(expense._id, {
      ocr_request_id: ocrRequestId,
    });

    return {
      ocr_request_id: ocrRequestId,
      request_payload: requestPayload,
      status: "pending" as const,
      should_dispatch: true,
      reused: false,
    };
  },
});

export const markOcrRequestProcessingInternal = internalMutation({
  args: {
    ocr_request_id: v.id("ocr_requests"),
    identity_subject: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActorFromSubject(ctx, args.identity_subject);
    const request = await ctx.db.get(args.ocr_request_id);
    if (!request) {
      fail("NOT_FOUND", "OCR request not found.");
    }
    if (request.company_id !== actor.company_id) {
      fail("FORBIDDEN", "OCR request belongs to another company.");
    }

    if (request.status === "completed" || request.status === "failed") {
      fail("INVALID_STATE", "Cannot process a finalized OCR request.");
    }

    if (request.status === "processing") {
      return {
        ocr_request_id: request._id,
        status: request.status,
        attempt_count: request.attempt_count,
        changed: false,
      };
    }

    const maxAttempts = getMaxAttempts();
    if (request.attempt_count >= maxAttempts) {
      fail("CONFLICT", "OCR request reached max retry attempts.");
    }

    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: "processing",
      attempt_count: request.attempt_count + 1,
      started_at: now,
      error_message: undefined,
      updated_at: now,
    });

    return {
      ocr_request_id: request._id,
      status: "processing" as const,
      attempt_count: request.attempt_count + 1,
      changed: true,
    };
  },
});

export const completeOcrRequestInternal = internalMutation({
  args: {
    ocr_request_id: v.id("ocr_requests"),
    response_payload: v.any(),
    normalized: v.object({
      merchant: v.union(v.string(), v.null()),
      amount: v.union(v.number(), v.null()),
      currency_code: v.union(v.string(), v.null()),
      expense_date: v.union(v.string(), v.null()),
      confidence: v.number(),
      warnings: v.array(v.string()),
      line_items: v.array(
        v.object({
          description: v.string(),
          amount: v.union(v.number(), v.null()),
          quantity: v.union(v.number(), v.null()),
        })
      ),
      raw_text: v.string(),
    }),
    identity_subject: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActorFromSubject(ctx, args.identity_subject);
    const request = await ctx.db.get(args.ocr_request_id);
    if (!request) {
      fail("NOT_FOUND", "OCR request not found.");
    }
    if (request.company_id !== actor.company_id) {
      fail("FORBIDDEN", "OCR request belongs to another company.");
    }

    if (request.status === "completed") {
      return {
        ocr_request_id: request._id,
        status: request.status,
        changed: false,
      };
    }

    if (request.status === "failed") {
      fail("INVALID_STATE", "Cannot complete an OCR request that already failed.");
    }

    const expense = await ctx.db.get(request.expense_id);
    if (!expense) {
      fail("NOT_FOUND", "Expense for OCR request not found.");
    }
    if (expense.company_id !== actor.company_id) {
      fail("FORBIDDEN", "Expense belongs to another company.");
    }

    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: "completed",
      response_payload: args.response_payload,
      error_message: undefined,
      completed_at: now,
      updated_at: now,
    });

    await ctx.db.patch(expense._id, {
      ocr_request_id: request._id,
      ocr_data: {
        extracted: {
          merchant: args.normalized.merchant,
          amount: args.normalized.amount,
          currency_code: args.normalized.currency_code,
          expense_date: args.normalized.expense_date,
          line_items: args.normalized.line_items,
          warnings: args.normalized.warnings,
        },
        raw: {
          raw_text: args.normalized.raw_text,
          response_payload: args.response_payload,
        },
        confidence: args.normalized.confidence,
      },
    });

    return {
      ocr_request_id: request._id,
      status: "completed" as const,
      changed: true,
    };
  },
});

export const failOcrRequestInternal = internalMutation({
  args: {
    ocr_request_id: v.id("ocr_requests"),
    error_message: v.string(),
    response_payload: v.optional(v.any()),
    identity_subject: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireActorFromSubject(ctx, args.identity_subject);
    const request = await ctx.db.get(args.ocr_request_id);
    if (!request) {
      fail("NOT_FOUND", "OCR request not found.");
    }
    if (request.company_id !== actor.company_id) {
      fail("FORBIDDEN", "OCR request belongs to another company.");
    }

    if (request.status === "failed") {
      return {
        ocr_request_id: request._id,
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
      response_payload: args.response_payload,
      error_message: args.error_message,
      completed_at: now,
      updated_at: now,
    });

    return {
      ocr_request_id: request._id,
      status: "failed" as const,
      changed: true,
    };
  },
});

export const requestOcrExtraction = action({
  args: {
    expense_id: v.id("expenses"),
    hints: v.optional(
      v.object({
        company_currency: v.optional(v.string()),
        locale: v.optional(v.string()),
        mime_type: v.optional(v.string()),
      })
    ),
    force_new: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      fail("UNAUTHORIZED", "Authentication is required.");
    }

    const created: {
      ocr_request_id: Id<"ocr_requests">;
      request_payload: OcrWorkerRequestPayload;
      status: "pending" | "processing" | "completed" | "failed";
      should_dispatch: boolean;
      reused: boolean;
    } = await ctx.runMutation(internal.ocr.createOcrRequestInternal, {
      expense_id: args.expense_id,
      hints: args.hints,
      force_new: args.force_new,
      identity_subject: identity.subject,
    });

    if (!created.should_dispatch) {
      return {
        ocr_request_id: created.ocr_request_id,
        status: created.status,
        reused: created.reused,
        dispatched: false,
      };
    }

    await ctx.runMutation(internal.ocr.markOcrRequestProcessingInternal, {
      ocr_request_id: created.ocr_request_id,
      identity_subject: identity.subject,
    });

    try {
      const { rawResponse, normalized } = await dispatchToOcrService(created.request_payload);

      if (normalized.requestId !== created.request_payload.requestId) {
        await ctx.runMutation(internal.ocr.failOcrRequestInternal, {
          ocr_request_id: created.ocr_request_id,
          error_message:
            "OCR response requestId does not match the dispatched OCR request.",
          response_payload: rawResponse,
          identity_subject: identity.subject,
        });

        return {
          ocr_request_id: created.ocr_request_id,
          status: "failed" as const,
          reused: created.reused,
          dispatched: true,
        };
      }

      if (normalized.status === "failed") {
        await ctx.runMutation(internal.ocr.failOcrRequestInternal, {
          ocr_request_id: created.ocr_request_id,
          error_message:
            normalized.errorMessage ??
            (normalized.warnings.join("; ") || "OCR service reported failure"),
          response_payload: rawResponse,
          identity_subject: identity.subject,
        });

        return {
          ocr_request_id: created.ocr_request_id,
          status: "failed" as const,
          reused: created.reused,
          dispatched: true,
        };
      }

      await ctx.runMutation(internal.ocr.completeOcrRequestInternal, {
        ocr_request_id: created.ocr_request_id,
        response_payload: rawResponse,
        normalized: {
          merchant: normalized.merchant,
          amount: normalized.amount,
          currency_code: normalized.currencyCode,
          expense_date: normalized.expenseDate,
          confidence: normalized.confidence,
          warnings: normalized.warnings,
          line_items: normalized.lineItems,
          raw_text: normalized.rawText,
        },
        identity_subject: identity.subject,
      });

      return {
        ocr_request_id: created.ocr_request_id,
        status: "completed" as const,
        reused: created.reused,
        dispatched: true,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown OCR dispatch error";

      await ctx.runMutation(internal.ocr.failOcrRequestInternal, {
        ocr_request_id: created.ocr_request_id,
        error_message: message,
        response_payload: null,
        identity_subject: identity.subject,
      });

      return {
        ocr_request_id: created.ocr_request_id,
        status: "failed" as const,
        reused: created.reused,
        dispatched: true,
      };
    }
  },
});

export const listExpenseOcrRequests = query({
  args: {
    expense_id: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const expense = await ctx.db.get(args.expense_id);
    if (!expense) {
      fail("NOT_FOUND", "Expense not found.");
    }
    if (expense.company_id !== actor.company_id) {
      fail("FORBIDDEN", "Expense belongs to another company.");
    }

    const isOwner = expense.user_id === actor._id;
    const isPrivileged = actor.role === "admin" || actor.role === "manager";
    if (!isOwner && !isPrivileged) {
      fail("FORBIDDEN", "You are not allowed to view OCR requests for this expense.");
    }

    return await ctx.db
      .query("ocr_requests")
      .withIndex("by_expense", (q) => q.eq("expense_id", args.expense_id))
      .order("desc")
      .take(QUERY_HARD_LIMIT);
  },
});
