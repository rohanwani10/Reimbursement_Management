import { describe, expect, it } from "vitest";

import { inferMimeType, normalizeWorkerResponse } from "./ocr";

describe("inferMimeType", () => {
  it("detects pdf from url", () => {
    expect(inferMimeType("https://example.com/r.pdf")).toBe("application/pdf");
  });

  it("uses provided mime hint when present", () => {
    expect(inferMimeType("https://example.com/r.bin", "image/png")).toBe("image/png");
  });
});

describe("normalizeWorkerResponse", () => {
  it("normalizes successful OCR payload", () => {
    const normalized = normalizeWorkerResponse({
      requestId: "req_1",
      status: "completed",
      rawText: "hello",
      merchant: "Cafe",
      amount: 12.5,
      currencyCode: "USD",
      expenseDate: "2026-03-28",
      lineItems: [{ description: "Meal", amount: 12.5, quantity: 1 }],
      confidence: 0.91,
      warnings: [],
      providerMetadata: { provider: "fastapi" },
      errorMessage: null,
    });

    expect(normalized.status).toBe("completed");
    expect(normalized.requestId).toBe("req_1");
    expect(normalized.lineItems).toHaveLength(1);
  });

  it("normalizes failed OCR payload", () => {
    const normalized = normalizeWorkerResponse({
      requestId: "req_2",
      status: "failed",
      rawText: "",
      merchant: null,
      amount: null,
      currencyCode: null,
      expenseDate: null,
      lineItems: [],
      confidence: 0,
      warnings: ["failed"],
      providerMetadata: {},
      errorMessage: "timeout",
    });

    expect(normalized.status).toBe("failed");
    expect(normalized.errorMessage).toBe("timeout");
  });
});
