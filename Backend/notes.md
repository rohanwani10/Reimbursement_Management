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
3. A Convex action calls this FastAPI service.
4. The service extracts normalized receipt data.
5. Convex stores the OCR payload back on the expense for human review.

## Initial API contract

### `GET /health`

Returns service health.

### `POST /ocr/extract`

Accepts one receipt input and returns a normalized OCR payload.

Example request body:

```json
{
  "expenseId": "exp_123",
  "receiptUrl": "https://example.com/receipt.jpg",
  "hints": {
    "currencyCode": "INR",
    "locale": "en-IN"
  }
}
```

Example response body:

```json
{
  "expenseId": "exp_123",
  "status": "completed",
  "merchant": "Cafe Example",
  "amount": 845.5,
  "currencyCode": "INR",
  "expenseDate": "2026-03-29",
  "rawText": "CAFE EXAMPLE ...",
  "lineItems": [],
  "confidence": 0.74,
  "warnings": [
    "Low confidence on merchant name"
  ]
}
```

## Design guidance

- Keep response fields normalized and app-facing.
- Preserve raw OCR text for audit and debugging.
- Return confidence and warnings so the UI can decide what to highlight.
- Prefer idempotent processing per expense/receipt input.
- Add provider-specific adapters behind a service layer instead of leaking them into route handlers.

## Future extensions

- asynchronous job mode for slow OCR providers
- duplicate receipt detection
- receipt tampering heuristics
- merchant/category enrichment
- multi-page document support
