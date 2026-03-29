# OCR Service

This service exists only for OCR and receipt-processing work.

## Scope

- Accept a receipt input from the main app
- Extract normalized receipt fields
- Return OCR output to Convex for storage and review

## Non-scope

- Authentication backend
- Expense or approval workflow API
- General company or user CRUD

## Local run

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Planned integration

The main app should call this service from a Convex action, then persist the returned OCR payload on the expense record.
