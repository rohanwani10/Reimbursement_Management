# OCR Service

This service exists only for OCR and receipt-processing work.

## Scope

- Accept a job-style OCR request payload from Convex
- Fetch receipt content from durable URL storage
- Extract and normalize receipt fields with PaddleOCR
- Return normalized OCR output and provider metadata to Convex

## Non-scope

- Authentication backend
- Expense or approval workflow API
- General company or user CRUD

## Local run

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Current API

- `GET /health`
  - returns service health and OCR provider metadata

- `POST /ocr/extract`
  - accepts `application/json`
  - request body includes `requestId`, `expenseId`, `receiptUrl`, `mimeType`, `hints`
  - returns normalized extraction contract with `status = completed | failed`

## Integration note

Convex should call this service from an action, persist request state on `ocrRequests`, and store only reviewable extracted summaries on the expense record.
