# OCR Service Notes

This directory is for a dedicated FastAPI microservice that handles OCR and receipt-processing tasks for the reimbursement app.

## Service boundary

The OCR service is intentionally narrow.

It is responsible for:

- receipt image intake
- image preprocessing
- OCR text extraction
- normalization of extracted fields
- confidence scoring
- optional vendor/category inference later

It is not responsible for:

- user authentication
- company or user management
- expense CRUD
- approval workflows
- comments, notifications, or reporting
- being the system of record for reimbursement data

Those concerns belong in Convex.

## Integration model

1. The web app creates and stores draft expenses in Convex.
2. A receipt is uploaded and linked to an expense.
3. Convex creates an `ocrRequests` record with `pending` status.
4. A Convex action calls this FastAPI service using a JSON job payload.
5. The service fetches the receipt from URL, extracts normalized receipt data, and returns status + payload.
6. Convex updates request status and stores extracted summaries on the expense for human review.

## Current API contract

### `GET /health`

Returns service health.

### `POST /ocr/extract`

Accepts one OCR job request and returns a normalized extraction response.

Request body:

```json
{
  "requestId": "ocr_req_123",
  "expenseId": "exp_123",
  "receiptUrl": "https://storage.example.com/receipts/abc.pdf",
  "mimeType": "application/pdf",
  "hints": {
    "companyCurrency": "INR",
    "locale": "en-IN"
  }
}
```

Response body:

```json
{
  "requestId": "ocr_req_123",
  "expenseId": "exp_123",
  "status": "completed",
  "rawText": "...",
  "merchant": "Cafe Example",
  "amount": 845.5,
  "currencyCode": "INR",
  "expenseDate": "2026-03-29",
  "lineItems": [],
  "confidence": 0.81,
  "warnings": [],
  "providerMetadata": {
    "provider": "paddleocr-local"
  },
  "errorMessage": null
}
```

## Design guidance

- Keep response fields stable and app-facing.
- Preserve enough OCR detail for audit and debugging when the response contract is refined.
- Prefer idempotent processing per expense/receipt input.
- Add provider-specific adapters behind a service layer instead of leaking them into route handlers.

## Future extensions

- asynchronous callback job mode (`202 accepted` + callback endpoint) for slow OCR providers
- duplicate receipt detection
- receipt tampering heuristics
- merchant/category enrichment
- multi-page document support
