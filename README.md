# Reimbursement Management

Reimbursement Management is being built as a Convex-first web application with a narrow Python OCR service.

## Architecture

### Primary application stack

- `Next.js` for the web app and route layer
- `Clerk` for authentication
- `Convex` for the primary backend, database, workflow logic, and realtime queries

### Supporting service

- `FastAPI` for OCR and receipt-processing only

Convex is the system of record for companies, users, expenses, approval rules, approvals, comments, notifications, and reporting views. The Python service should not own business entities or approval workflows.

## Repository layout

```text
Frontend/   Next.js app + Convex backend functions
Backend/    FastAPI OCR microservice
PRD.md      Product requirements and product scope
```

## Intended request flow

1. A user signs in with Clerk.
2. The app reads and mutates reimbursement data through Convex functions.
3. Receipt uploads are attached to draft expenses.
4. A Convex action calls the OCR service when extraction is needed.
5. OCR output is written back to Convex and shown to the user for review.
6. Expense submission and approval routing continue entirely in Convex.

## Why this split

- One source of truth for business data and workflow state
- Realtime UI updates without building custom sync layers
- Python kept for the one area where it is likely to matter most: OCR and document processing
- Lower operational complexity than running a general-purpose REST backend beside Convex

## Current status

- `Frontend/` still contains starter Convex demo code and needs to be migrated to reimbursement-specific schema and screens.
- `Backend/` is now reserved for the OCR microservice scaffold.
- Planning docs were originally written for `FastAPI + PostgreSQL`; they should now be interpreted through the Convex-first architecture described here.

## Next implementation steps

1. Replace the sample Convex schema with reimbursement domain tables.
2. Remove the sample `numbers` feature and starter UI.
3. Add expense draft, receipt upload, and OCR review flows.
4. Build approval rule management and approval inboxes in Convex.
5. Expand the OCR service from scaffold to a real extraction pipeline.
