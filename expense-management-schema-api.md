# Reimbursement Management — Database Schema & API Reference

> **Stack:** Python · FastAPI · PostgreSQL (suggested) · SQLAlchemy ORM
> **Auth:** JWT Bearer tokens (access + refresh)

---

## Table of Contents

1. [Database Schema](#1-database-schema)
2. [Enums & Constants](#2-enums--constants)
3. [Authentication APIs](#3-authentication-apis)
4. [User & Company Management APIs](#4-user--company-management-apis)
5. [Expense APIs](#5-expense-apis)
6. [Approval Workflow APIs](#6-approval-workflow-apis)
7. [Approval Rules APIs](#7-approval-rules-apis)
8. [OCR APIs](#8-ocr-apis)
9. [Utility APIs](#9-utility-apis)
10. [Password & Account APIs](#10-password--account-apis)
11. [Notifications APIs](#11-notifications-apis)
12. [Comments & Activity Log APIs](#12-comments--activity-log-apis)
13. [Reporting & Export APIs](#13-reporting--export-apis)
14. [File & Receipt Management APIs](#14-file--receipt-management-apis)
15. [Error Codes](#15-error-codes)

---

## 1. Database Schema

### 1.1 `companies`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, default gen_random_uuid() | |
| `name` | VARCHAR(255) | NOT NULL | |
| `country` | VARCHAR(100) | NOT NULL | ISO country name |
| `currency_code` | VARCHAR(10) | NOT NULL | e.g. `USD`, `INR` |
| `currency_symbol` | VARCHAR(10) | NOT NULL | e.g. `$`, `₹` |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 1.2 `users`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `company_id` | UUID | FK → companies.id, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | |
| `hashed_password` | TEXT | NOT NULL | bcrypt |
| `role` | ENUM(`admin`,`manager`,`employee`) | NOT NULL | |
| `manager_id` | UUID | FK → users.id, NULLABLE | Direct manager |
| `is_manager_approver` | BOOLEAN | default FALSE | Whether manager is in approval chain |
| `is_active` | BOOLEAN | default TRUE | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 1.3 `approval_rules`

Defines the approval policy for expense submissions (per company, optionally scoped by category or threshold).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `company_id` | UUID | FK → companies.id, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | Human-readable label |
| `category` | VARCHAR(100) | NULLABLE | Applies to specific expense category; NULL = all |
| `amount_threshold` | NUMERIC(12,2) | NULLABLE | Rule applies when expense ≥ this amount; NULL = always |
| `is_manager_approver` | BOOLEAN | default FALSE | Manager is always first approver |
| `sequential_approval` | BOOLEAN | default TRUE | Approvers act in defined order |
| `condition_type` | ENUM(`all`,`percentage`,`specific`,`hybrid`) | NOT NULL, default `all` | |
| `condition_percentage` | NUMERIC(5,2) | NULLABLE | e.g. 60.00 for 60% |
| `specific_approver_id` | UUID | FK → users.id, NULLABLE | For `specific` / `hybrid` condition |
| `is_active` | BOOLEAN | default TRUE | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 1.4 `approval_rule_approvers`

Ordered list of approvers attached to an approval rule.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `rule_id` | UUID | FK → approval_rules.id, NOT NULL | |
| `user_id` | UUID | FK → users.id, NOT NULL | |
| `order` | INTEGER | NOT NULL | 1-based sequence |

**Unique constraint:** `(rule_id, user_id)`, `(rule_id, order)`

---

### 1.5 `expenses`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `company_id` | UUID | FK → companies.id, NOT NULL | |
| `employee_id` | UUID | FK → users.id, NOT NULL | Submitter |
| `amount` | NUMERIC(12,2) | NOT NULL | In submitted currency |
| `currency_code` | VARCHAR(10) | NOT NULL | Submitted currency |
| `converted_amount` | NUMERIC(12,2) | NOT NULL | In company's base currency |
| `exchange_rate` | NUMERIC(16,6) | NOT NULL | Rate at time of submission |
| `category` | VARCHAR(100) | NOT NULL | |
| `description` | TEXT | NULLABLE | |
| `expense_date` | DATE | NOT NULL | Date of incurred expense |
| `receipt_url` | TEXT | NULLABLE | Uploaded receipt file URL |
| `ocr_raw` | JSONB | NULLABLE | Raw OCR output |
| `status` | ENUM(`draft`,`pending`,`approved`,`rejected`) | NOT NULL, default `draft` | |
| `rule_id` | UUID | FK → approval_rules.id, NULLABLE | Matched rule at time of submission |
| `current_approver_index` | INTEGER | NOT NULL, default 0 | Pointer into the approver sequence |
| `submitted_at` | TIMESTAMPTZ | NULLABLE | Set when status → pending |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now() | |

---

### 1.6 `expense_approvals`

One row per approver per expense (audit trail).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `expense_id` | UUID | FK → expenses.id, NOT NULL | |
| `approver_id` | UUID | FK → users.id, NOT NULL | |
| `order` | INTEGER | NOT NULL | Mirrors rule order |
| `status` | ENUM(`pending`,`approved`,`rejected`,`skipped`) | NOT NULL, default `pending` | |
| `comment` | TEXT | NULLABLE | |
| `acted_at` | TIMESTAMPTZ | NULLABLE | When decision was made |

**Unique constraint:** `(expense_id, approver_id)`

---

### 1.7 `refresh_tokens`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `user_id` | UUID | FK → users.id, NOT NULL | |
| `token_hash` | TEXT | NOT NULL | SHA-256 of raw token |
| `expires_at` | TIMESTAMPTZ | NOT NULL | |
| `revoked` | BOOLEAN | default FALSE | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |

---

## 2. Enums & Constants

```python
# app/enums.py

from enum import Enum

class UserRole(str, Enum):
    admin = "admin"
    manager = "manager"
    employee = "employee"

class ExpenseStatus(str, Enum):
    draft = "draft"
    pending = "pending"
    approved = "approved"
    rejected = "rejected"

class ApprovalStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    skipped = "skipped"

class ConditionType(str, Enum):
    all = "all"           # All approvers must approve
    percentage = "percentage"  # X% must approve
    specific = "specific"      # One key approver auto-approves
    hybrid = "hybrid"          # percentage OR specific approver
```

---

## 3. Authentication APIs

Base path: `/api/v1/auth`

---

### `POST /auth/signup`

Creates a new company + admin user in one step (first-time registration).

**Request Body**
```json
{
  "company_name": "Acme Corp",
  "country": "United States",
  "admin_name": "Alice Admin",
  "email": "alice@acme.com",
  "password": "StrongPass123!"
}
```

**Response `201`**
```json
{
  "access_token": "<jwt>",
  "refresh_token": "<token>",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "name": "Alice Admin",
    "email": "alice@acme.com",
    "role": "admin"
  },
  "company": {
    "id": "uuid",
    "name": "Acme Corp",
    "currency_code": "USD",
    "currency_symbol": "$"
  }
}
```

**Errors:** `409` email already exists

---

### `POST /auth/login`

**Request Body**
```json
{
  "email": "alice@acme.com",
  "password": "StrongPass123!"
}
```

**Response `200`**
```json
{
  "access_token": "<jwt>",
  "refresh_token": "<token>",
  "token_type": "bearer",
  "user": { "id": "...", "name": "...", "role": "admin" }
}
```

**Errors:** `401` invalid credentials, `403` account inactive

---

### `POST /auth/refresh`

Exchange a refresh token for a new access token.

**Request Body**
```json
{ "refresh_token": "<token>" }
```

**Response `200`**
```json
{ "access_token": "<jwt>", "token_type": "bearer" }
```

---

### `POST /auth/logout`

Revokes the current refresh token.

**Headers:** `Authorization: Bearer <access_token>`

**Response `204`** No Content

---

## 4. User & Company Management APIs

Base path: `/api/v1`

> All routes require `Authorization: Bearer <token>` unless noted.

---

### `GET /company`

Returns current user's company details.

**Roles:** all

**Response `200`**
```json
{
  "id": "uuid",
  "name": "Acme Corp",
  "country": "United States",
  "currency_code": "USD",
  "currency_symbol": "$"
}
```

---

### `PATCH /company`

Update company name or currency.

**Roles:** `admin`

**Request Body** *(all fields optional)*
```json
{
  "name": "Acme Corporation",
  "currency_code": "EUR"
}
```

**Response `200`** Updated company object.

---

### `GET /users`

List all users in the company.

**Roles:** `admin`

**Query Params**

| Param | Type | Notes |
|---|---|---|
| `role` | string | Filter by role |
| `is_active` | bool | default true |
| `page` | int | default 1 |
| `page_size` | int | default 20, max 100 |

**Response `200`**
```json
{
  "items": [
    {
      "id": "uuid", "name": "Bob Manager", "email": "bob@acme.com",
      "role": "manager", "manager_id": "uuid", "is_manager_approver": true,
      "is_active": true
    }
  ],
  "total": 5, "page": 1, "page_size": 20
}
```

---

### `POST /users`

Create a new employee or manager.

**Roles:** `admin`

**Request Body**
```json
{
  "name": "Dave Employee",
  "email": "dave@acme.com",
  "password": "TempPass123!",
  "role": "employee",
  "manager_id": "uuid",
  "is_manager_approver": false
}
```

**Response `201`** Created user object.

**Errors:** `409` email exists, `422` invalid manager_id

---

### `GET /users/{user_id}`

**Roles:** `admin` (any user), `manager`/`employee` (self only)

**Response `200`** User object.

---

### `PATCH /users/{user_id}`

Update role, manager assignment, or active status.

**Roles:** `admin`

**Request Body** *(all optional)*
```json
{
  "name": "Dave Smith",
  "role": "manager",
  "manager_id": "uuid",
  "is_manager_approver": true,
  "is_active": true
}
```

**Response `200`** Updated user object.

---

### `DELETE /users/{user_id}`

Soft-delete (sets `is_active = false`).

**Roles:** `admin`

**Response `204`** No Content.

---

### `GET /users/me`

Returns the authenticated user's profile.

**Roles:** all

**Response `200`** User object including company info.

---

## 5. Expense APIs

Base path: `/api/v1/expenses`

---

### `GET /expenses`

List expenses with filters.

**Roles:**
- `employee` → own expenses only
- `manager` → team expenses (direct reports)
- `admin` → all expenses

**Query Params**

| Param | Type | Notes |
|---|---|---|
| `status` | string | `draft`, `pending`, `approved`, `rejected` |
| `category` | string | Filter by category |
| `employee_id` | uuid | Admin/manager only |
| `date_from` | date | `YYYY-MM-DD` |
| `date_to` | date | `YYYY-MM-DD` |
| `page` | int | default 1 |
| `page_size` | int | default 20 |

**Response `200`**
```json
{
  "items": [
    {
      "id": "uuid",
      "employee": { "id": "uuid", "name": "Dave Employee" },
      "amount": 250.00,
      "currency_code": "USD",
      "converted_amount": 250.00,
      "category": "Travel",
      "description": "Client visit cab fare",
      "expense_date": "2025-06-10",
      "status": "pending",
      "receipt_url": null,
      "submitted_at": "2025-06-10T09:30:00Z",
      "approvals": [
        {
          "order": 1, "approver": { "id": "uuid", "name": "Bob Manager" },
          "status": "pending", "comment": null, "acted_at": null
        }
      ]
    }
  ],
  "total": 12, "page": 1, "page_size": 20
}
```

---

### `POST /expenses`

Submit a new expense claim.

**Roles:** `employee`

**Request Body**
```json
{
  "amount": 250.00,
  "currency_code": "INR",
  "category": "Travel",
  "description": "Client visit cab fare",
  "expense_date": "2025-06-10",
  "receipt_url": "https://storage.example.com/receipts/abc.jpg"
}
```

**Backend logic on create:**
1. Fetch live exchange rate via `https://api.exchangerate-api.com/v4/latest/{BASE_CURRENCY}`.
2. Compute `converted_amount` and store `exchange_rate`.
3. Match the most specific active `approval_rule` (by category + threshold).
4. Build `expense_approvals` rows from the rule's approvers.
5. If `is_manager_approver` is TRUE on the rule, prepend the employee's direct manager as `order = 0`.
6. Set `status = pending`, `current_approver_index = 0`.

**Response `201`** Full expense object with approval chain.

**Errors:** `422` invalid currency, `404` no active rule found (can still submit, goes to admin)

---

### `GET /expenses/{expense_id}`

**Roles:**
- `employee` → own expenses
- `manager` → team expenses
- `admin` → any

**Response `200`** Full expense detail including full approval history.

---

### `PATCH /expenses/{expense_id}`

Edit a **draft** expense before submission.

**Roles:** `employee` (owner only)

**Request Body** *(all optional)*
```json
{
  "amount": 300.00,
  "currency_code": "USD",
  "category": "Meals",
  "description": "Updated description",
  "expense_date": "2025-06-11",
  "receipt_url": "https://..."
}
```

**Response `200`** Updated expense.

**Errors:** `403` expense is not in `draft` status

---

### `POST /expenses/{expense_id}/submit`

Move a draft expense to `pending` and trigger the approval workflow.

**Roles:** `employee` (owner only)

**Response `200`**
```json
{ "status": "pending", "message": "Expense submitted for approval." }
```

---

### `DELETE /expenses/{expense_id}`

Delete a **draft** expense.

**Roles:** `employee` (owner only)

**Response `204`** No Content.

---

### `GET /expenses/summary`

Aggregated stats for dashboard cards.

**Roles:** all (scoped by role)

**Response `200`**
```json
{
  "total_submitted": 24,
  "total_approved": 18,
  "total_rejected": 3,
  "total_pending": 3,
  "total_amount_approved": 4520.00,
  "total_amount_pending": 780.00,
  "currency_symbol": "$"
}
```

---

## 6. Approval Workflow APIs

Base path: `/api/v1/expenses/{expense_id}/approvals`

---

### `GET /expenses/{expense_id}/approvals`

List all approval steps for an expense.

**Roles:** `manager` (assigned approver), `admin`

**Response `200`**
```json
[
  {
    "id": "uuid", "order": 1,
    "approver": { "id": "uuid", "name": "Bob Manager" },
    "status": "approved", "comment": "Looks good!", "acted_at": "2025-06-10T10:00:00Z"
  },
  {
    "id": "uuid", "order": 2,
    "approver": { "id": "uuid", "name": "Carol Finance" },
    "status": "pending", "comment": null, "acted_at": null
  }
]
```

---

### `POST /expenses/{expense_id}/approvals/action`

Approve or reject an expense at the current step.

**Roles:** `manager` (must be the active approver), `admin` (can act at any step)

**Request Body**
```json
{
  "action": "approved",
  "comment": "All receipts verified."
}
```

**Backend logic:**
1. Verify the calling user is the current active approver (or admin).
2. Update `expense_approvals` row: set `status`, `comment`, `acted_at`.
3. **If `action = rejected`:** set `expense.status = rejected`. Stop chain.
4. **If `action = approved`:** evaluate condition rule:
   - `all` → advance to next approver; if last → set `expense.status = approved`.
   - `percentage` → check if approved count / total ≥ threshold → auto-approve, else advance.
   - `specific` → if this approver is the designated specific approver → auto-approve entire expense.
   - `hybrid` → apply percentage OR specific logic, whichever triggers first.
5. Increment `current_approver_index` if chain continues.

**Response `200`**
```json
{
  "expense_id": "uuid",
  "expense_status": "approved",
  "message": "Expense approved and workflow complete."
}
```

**Errors:** `403` not the active approver, `409` expense already resolved

---

### `POST /expenses/{expense_id}/approvals/override`

Admin override — force approve or reject at any stage.

**Roles:** `admin` only

**Request Body**
```json
{
  "action": "approved",
  "comment": "Admin override: urgent reimbursement."
}
```

**Response `200`** Updated expense status.

---

## 7. Approval Rules APIs

Base path: `/api/v1/approval-rules`

---

### `GET /approval-rules`

List all approval rules for the company.

**Roles:** `admin`

**Response `200`**
```json
{
  "items": [
    {
      "id": "uuid", "name": "Standard Travel Approval",
      "category": "Travel", "amount_threshold": 500.00,
      "is_manager_approver": true,
      "sequential_approval": true,
      "condition_type": "all",
      "condition_percentage": null,
      "specific_approver": null,
      "approvers": [
        { "order": 1, "user": { "id": "uuid", "name": "Bob Manager" } },
        { "order": 2, "user": { "id": "uuid", "name": "Carol Finance" } }
      ],
      "is_active": true
    }
  ]
}
```

---

### `POST /approval-rules`

Create a new approval rule.

**Roles:** `admin`

**Request Body**
```json
{
  "name": "High-Value Travel Approval",
  "category": "Travel",
  "amount_threshold": 1000.00,
  "is_manager_approver": true,
  "sequential_approval": true,
  "condition_type": "hybrid",
  "condition_percentage": 60.0,
  "specific_approver_id": "uuid-of-cfo",
  "approvers": [
    { "user_id": "uuid", "order": 1 },
    { "user_id": "uuid", "order": 2 },
    { "user_id": "uuid", "order": 3 }
  ]
}
```

**Response `201`** Created rule object.

**Errors:** `422` invalid approver user_id, duplicate order values

---

### `GET /approval-rules/{rule_id}`

**Roles:** `admin`

**Response `200`** Full rule detail.

---

### `PATCH /approval-rules/{rule_id}`

Update an existing rule. Changes apply only to **new** expense submissions.

**Roles:** `admin`

**Request Body** *(all optional — same shape as POST)*

**Response `200`** Updated rule.

---

### `DELETE /approval-rules/{rule_id}`

Soft-delete (`is_active = false`).

**Roles:** `admin`

**Response `204`** No Content.

---

## 8. OCR APIs

Base path: `/api/v1/ocr`

---

### `POST /ocr/upload`

Upload a receipt image or PDF and extract expense fields via OCR.

**Roles:** `employee`

**Request:** `multipart/form-data`

| Field | Type | Notes |
|---|---|---|
| `file` | binary | JPEG, PNG, PDF. Max 10 MB. |

**Backend logic:**
1. Store file in object storage (S3 / GCS), get back `receipt_url`.
2. Run OCR (e.g. Google Vision API / Tesseract / AWS Textract).
3. Parse extracted text to identify: `amount`, `currency`, `date`, `vendor_name`, `category` (heuristic).
4. Return structured fields + raw OCR output for review.

**Response `200`**
```json
{
  "receipt_url": "https://storage.example.com/receipts/xyz.jpg",
  "extracted": {
    "amount": 1250.00,
    "currency_code": "INR",
    "expense_date": "2025-06-09",
    "description": "Dinner at The Spice Garden",
    "category": "Meals",
    "vendor_name": "The Spice Garden"
  },
  "ocr_raw": { "...": "raw provider output" },
  "confidence": 0.91
}
```

**Errors:** `415` unsupported file type, `422` OCR could not parse file, `413` file too large

---

### `POST /ocr/parse-url`

Re-run OCR on an already-uploaded receipt URL.

**Roles:** `employee`, `admin`

**Request Body**
```json
{ "receipt_url": "https://storage.example.com/receipts/xyz.jpg" }
```

**Response `200`** Same shape as `/ocr/upload`.

---

## 9. Utility APIs

---

### `GET /utils/countries`

Returns list of countries with their currency info (proxied from restcountries.com).

**Auth:** Not required

**Response `200`**
```json
[
  {
    "name": "India",
    "currency_code": "INR",
    "currency_name": "Indian rupee",
    "currency_symbol": "₹"
  }
]
```

> Internally calls: `https://restcountries.com/v3.1/all?fields=name,currencies`

---

### `GET /utils/exchange-rate`

Returns current exchange rates from a base currency.

**Auth:** Required

**Query Params**

| Param | Type | Required | Notes |
|---|---|---|---|
| `base` | string | yes | e.g. `USD` |
| `target` | string | no | If omitted, returns all rates |

**Response `200`**
```json
{
  "base": "USD",
  "date": "2025-06-10",
  "rates": {
    "INR": 83.42,
    "EUR": 0.92,
    "GBP": 0.79
  }
}
```

> Internally calls: `https://api.exchangerate-api.com/v4/latest/{base}`

---

## 10. Password & Account APIs

Base path: `/api/v1/auth`

---

### `POST /auth/forgot-password`

Sends a password-reset OTP / link to the user's email.

**Auth:** Not required

**Request Body**
```json
{ "email": "dave@acme.com" }
```

**Response `200`**
```json
{ "message": "If that email exists, a reset link has been sent." }
```

> Always returns 200 to prevent email enumeration.

---

### `POST /auth/reset-password`

Resets the password using the token received via email.

**Auth:** Not required

**Request Body**
```json
{
  "token": "<reset-token>",
  "new_password": "NewStrongPass123!"
}
```

**Response `200`**
```json
{ "message": "Password reset successful. Please log in." }
```

**Errors:** `400` token expired or invalid, `422` password too weak

---

### `POST /auth/change-password`

Changes password for an authenticated user (knows current password).

**Auth:** Required (all roles)

**Request Body**
```json
{
  "current_password": "OldPass123!",
  "new_password": "NewStrongPass123!"
}
```

**Response `200`**
```json
{ "message": "Password changed successfully." }
```

**Errors:** `401` current password incorrect, `422` new password same as old / too weak

---

## 11. Notifications APIs

Base path: `/api/v1/notifications`

> Notifications are generated server-side on key events:
> expense submitted, approval action taken, expense approved/rejected, rule updated.

---

### `GET /notifications`

List notifications for the authenticated user.

**Roles:** all

**Query Params**

| Param | Type | Notes |
|---|---|---|
| `is_read` | bool | Filter unread (`false`) or read (`true`) |
| `page` | int | default 1 |
| `page_size` | int | default 20 |

**Response `200`**
```json
{
  "items": [
    {
      "id": "uuid",
      "type": "expense_submitted",
      "title": "New expense awaiting your approval",
      "body": "Dave Employee submitted a ₹1,250.00 Travel expense.",
      "expense_id": "uuid",
      "is_read": false,
      "created_at": "2025-06-10T09:31:00Z"
    }
  ],
  "unread_count": 3,
  "total": 14,
  "page": 1,
  "page_size": 20
}
```

**Notification `type` values:**

| Type | Triggered when |
|---|---|
| `expense_submitted` | Employee submits; sent to first approver |
| `expense_approved` | Fully approved; sent to employee |
| `expense_rejected` | Rejected at any step; sent to employee |
| `approval_required` | Next approver in chain becomes active |
| `rule_updated` | Admin changes an approval rule |
| `expense_overridden` | Admin overrides approval |

---

### `PATCH /notifications/{notification_id}/read`

Mark a single notification as read.

**Roles:** all (own notifications only)

**Response `200`**
```json
{ "id": "uuid", "is_read": true }
```

---

### `POST /notifications/read-all`

Mark all notifications as read for the current user.

**Roles:** all

**Response `200`**
```json
{ "marked_read": 5 }
```

---

### `DELETE /notifications/{notification_id}`

Delete a notification.

**Roles:** all (own notifications only)

**Response `204`** No Content.

---

### `GET /notifications/preferences`

Get the current user's notification preferences.

**Roles:** all

**Response `200`**
```json
{
  "email_on_submission": true,
  "email_on_approval": true,
  "email_on_rejection": true,
  "in_app": true
}
```

---

### `PATCH /notifications/preferences`

Update notification preferences.

**Roles:** all

**Request Body** *(all optional)*
```json
{
  "email_on_submission": false,
  "email_on_approval": true,
  "email_on_rejection": true,
  "in_app": true
}
```

**Response `200`** Updated preferences object.

---

## 12. Comments & Activity Log APIs

Base path: `/api/v1/expenses/{expense_id}`

---

### `GET /expenses/{expense_id}/comments`

List all comments on an expense (threaded audit trail).

**Roles:**
- `employee` → own expenses
- `manager` → assigned expenses
- `admin` → any

**Response `200`**
```json
{
  "items": [
    {
      "id": "uuid",
      "author": { "id": "uuid", "name": "Bob Manager", "role": "manager" },
      "body": "Please attach the original invoice.",
      "created_at": "2025-06-10T10:15:00Z",
      "updated_at": null
    }
  ],
  "total": 2
}
```

---

### `POST /expenses/{expense_id}/comments`

Add a comment to an expense.

**Roles:** all (must have read access to the expense)

**Request Body**
```json
{ "body": "Please attach the original invoice." }
```

**Response `201`**
```json
{
  "id": "uuid",
  "author": { "id": "uuid", "name": "Bob Manager", "role": "manager" },
  "body": "Please attach the original invoice.",
  "created_at": "2025-06-10T10:15:00Z"
}
```

**Errors:** `403` no read access to expense, `422` empty body

---

### `PATCH /expenses/{expense_id}/comments/{comment_id}`

Edit own comment.

**Roles:** comment author only

**Request Body**
```json
{ "body": "Updated comment text." }
```

**Response `200`** Updated comment.

**Errors:** `403` not the comment author, `409` expense is resolved (commenting locked)

---

### `DELETE /expenses/{expense_id}/comments/{comment_id}`

Delete a comment.

**Roles:** comment author or `admin`

**Response `204`** No Content.

---

### `GET /expenses/{expense_id}/activity`

Full chronological activity log for an expense (system events + comments).

**Roles:**
- `employee` → own expenses
- `manager` → assigned expenses
- `admin` → any

**Response `200`**
```json
{
  "items": [
    {
      "id": "uuid",
      "event_type": "submitted",
      "actor": { "id": "uuid", "name": "Dave Employee" },
      "description": "Expense submitted for approval.",
      "metadata": {},
      "created_at": "2025-06-10T09:30:00Z"
    },
    {
      "id": "uuid",
      "event_type": "comment",
      "actor": { "id": "uuid", "name": "Bob Manager" },
      "description": "Please attach the original invoice.",
      "metadata": { "comment_id": "uuid" },
      "created_at": "2025-06-10T10:15:00Z"
    },
    {
      "id": "uuid",
      "event_type": "approved",
      "actor": { "id": "uuid", "name": "Bob Manager" },
      "description": "Approved at step 1. Comment: Looks good!",
      "metadata": { "step": 1, "comment": "Looks good!" },
      "created_at": "2025-06-10T10:20:00Z"
    }
  ],
  "total": 3
}
```

**`event_type` values:** `submitted`, `approved`, `rejected`, `overridden`, `comment`, `edited`, `rule_matched`, `escalated`

---

## 13. Reporting & Export APIs

Base path: `/api/v1/reports`

---

### `GET /reports/expenses`

Aggregated expense report with grouping and date range filters.

**Roles:** `admin`, `manager` (team-scoped)

**Query Params**

| Param | Type | Notes |
|---|---|---|
| `date_from` | date | `YYYY-MM-DD`, required |
| `date_to` | date | `YYYY-MM-DD`, required |
| `group_by` | string | `category`, `employee`, `status`, `month` |
| `employee_id` | uuid | Filter by employee (admin only) |
| `category` | string | Filter by category |
| `status` | string | Filter by status |

**Response `200`**
```json
{
  "date_from": "2025-06-01",
  "date_to": "2025-06-30",
  "group_by": "category",
  "currency_symbol": "$",
  "total_amount": 5820.00,
  "total_count": 24,
  "groups": [
    { "label": "Travel", "amount": 3200.00, "count": 10, "approved": 8, "rejected": 1, "pending": 1 },
    { "label": "Meals",  "amount": 980.00,  "count": 8,  "approved": 7, "rejected": 0, "pending": 1 }
  ]
}
```

---

### `GET /reports/approvals`

Approval turnaround time and bottleneck report.

**Roles:** `admin`

**Query Params**

| Param | Type | Notes |
|---|---|---|
| `date_from` | date | required |
| `date_to` | date | required |
| `approver_id` | uuid | Filter by specific approver |

**Response `200`**
```json
{
  "approvers": [
    {
      "approver": { "id": "uuid", "name": "Bob Manager" },
      "total_actioned": 18,
      "avg_turnaround_hours": 4.2,
      "approved_count": 15,
      "rejected_count": 3
    }
  ]
}
```

---

### `POST /reports/export`

Trigger an async export of expenses as CSV or PDF.

**Roles:** `admin`, `manager` (team-scoped)

**Request Body**
```json
{
  "format": "csv",
  "date_from": "2025-06-01",
  "date_to": "2025-06-30",
  "filters": {
    "status": "approved",
    "category": "Travel",
    "employee_id": null
  }
}
```

**`format`:** `csv` or `pdf`

**Response `202`**
```json
{
  "export_id": "uuid",
  "status": "processing",
  "message": "Export is being generated. Poll /reports/export/{export_id} for status."
}
```

---

### `GET /reports/export/{export_id}`

Poll export job status and get download URL when ready.

**Roles:** `admin`, `manager` (own exports only)

**Response `200`**
```json
{
  "export_id": "uuid",
  "status": "ready",
  "format": "csv",
  "download_url": "https://storage.example.com/exports/uuid.csv",
  "expires_at": "2025-06-10T12:00:00Z"
}
```

**`status` values:** `processing`, `ready`, `failed`

**Errors:** `404` export not found, `403` not owner

---

## 14. File & Receipt Management APIs

Base path: `/api/v1/files`

---

### `POST /files/upload`

Upload a receipt or supporting document and get back a permanent URL to attach to an expense.

**Roles:** `employee`, `admin`

**Request:** `multipart/form-data`

| Field | Type | Notes |
|---|---|---|
| `file` | binary | JPEG, PNG, PDF, HEIC. Max 10 MB. |
| `expense_id` | uuid | Optional. Auto-attaches to expense on upload. |

**Response `201`**
```json
{
  "file_id": "uuid",
  "file_name": "receipt_june10.jpg",
  "file_url": "https://storage.example.com/receipts/uuid.jpg",
  "mime_type": "image/jpeg",
  "size_bytes": 204800,
  "uploaded_at": "2025-06-10T09:28:00Z"
}
```

**Errors:** `413` file too large, `415` unsupported type

---

### `GET /files/{file_id}`

Get metadata for an uploaded file.

**Roles:** file owner, assigned approvers, `admin`

**Response `200`**
```json
{
  "file_id": "uuid",
  "file_name": "receipt_june10.jpg",
  "file_url": "https://storage.example.com/receipts/uuid.jpg",
  "mime_type": "image/jpeg",
  "size_bytes": 204800,
  "expense_id": "uuid",
  "uploaded_by": { "id": "uuid", "name": "Dave Employee" },
  "uploaded_at": "2025-06-10T09:28:00Z"
}
```

---

### `GET /files/{file_id}/download`

Get a short-lived pre-signed download URL for the file.

**Roles:** file owner, assigned approvers, `admin`

**Response `200`**
```json
{
  "download_url": "https://storage.example.com/receipts/uuid.jpg?token=xxx",
  "expires_at": "2025-06-10T09:43:00Z"
}
```

> Pre-signed URL is valid for 15 minutes.

---

### `DELETE /files/{file_id}`

Delete an uploaded file. Only allowed if the associated expense is still in `draft` status.

**Roles:** file owner, `admin`

**Response `204`** No Content.

**Errors:** `403` expense is no longer a draft, `404` file not found

---

### `GET /expenses/{expense_id}/files`

List all files attached to a specific expense.

**Roles:** expense owner, assigned approvers, `admin`

**Response `200`**
```json
{
  "items": [
    {
      "file_id": "uuid",
      "file_name": "receipt_june10.jpg",
      "file_url": "https://storage.example.com/receipts/uuid.jpg",
      "mime_type": "image/jpeg",
      "size_bytes": 204800,
      "uploaded_at": "2025-06-10T09:28:00Z"
    }
  ],
  "total": 1
}
```

---

## 15. Error Codes

All errors follow this envelope:

```json
{
  "detail": {
    "code": "EXPENSE_NOT_FOUND",
    "message": "The requested expense does not exist or you do not have access.",
    "field": null
  }
}
```

| HTTP | Code | Description |
|---|---|---|
| `400` | `BAD_REQUEST` | Malformed request body |
| `401` | `UNAUTHORIZED` | Missing or expired token |
| `403` | `FORBIDDEN` | Authenticated but insufficient permissions |
| `403` | `NOT_ACTIVE_APPROVER` | User is not the current approver in the chain |
| `403` | `EXPENSE_LOCKED` | Expense is not in a mutable state |
| `404` | `USER_NOT_FOUND` | |
| `404` | `EXPENSE_NOT_FOUND` | |
| `404` | `RULE_NOT_FOUND` | |
| `409` | `EMAIL_EXISTS` | Signup / user creation conflict |
| `409` | `APPROVAL_ALREADY_RESOLVED` | Expense is already approved/rejected |
| `413` | `FILE_TOO_LARGE` | Upload exceeds 10 MB |
| `415` | `UNSUPPORTED_FILE_TYPE` | Not JPEG/PNG/PDF/HEIC |
| `422` | `VALIDATION_ERROR` | Field-level validation failure |
| `422` | `OCR_PARSE_FAILED` | Could not extract data from receipt |
| `400` | `INVALID_RESET_TOKEN` | Password reset token expired or already used |
| `400` | `SAME_PASSWORD` | New password must differ from current |
| `403` | `FILE_LOCKED` | File cannot be deleted; expense is not a draft |
| `403` | `COMMENT_LOCKED` | Expense is resolved; comments are locked |
| `404` | `FILE_NOT_FOUND` | |
| `404` | `COMMENT_NOT_FOUND` | |
| `404` | `NOTIFICATION_NOT_FOUND` | |
| `404` | `EXPORT_NOT_FOUND` | |
| `409` | `EXPORT_IN_PROGRESS` | An export for the same params is already processing |
| `500` | `EXPORT_FAILED` | Async export job encountered an error |
| `500` | `INTERNAL_ERROR` | Unexpected server error |

---

## Appendix — Approval Workflow Decision Tree

```
Expense Submitted (status: pending)
        │
        ▼
Is is_manager_approver = TRUE on rule?
  YES → Insert manager as approver[0], shift others
  NO  → Use rule approvers as-is
        │
        ▼
Sequential? (sequential_approval = TRUE)
  YES → Notify approver[current_index]
  NO  → Notify all approvers simultaneously
        │
        ▼
Approver acts: APPROVE or REJECT
        │
   REJECT → expense.status = rejected  ✗ STOP
        │
   APPROVE → evaluate condition_type
        │
        ├── all       → all must approve → advance index
        │                last approved?  → expense.status = approved ✓
        │
        ├── percentage → approved_count / total >= threshold?
        │                YES → expense.status = approved ✓
        │                NO  → advance index
        │
        ├── specific  → this approver == specific_approver_id?
        │                YES → expense.status = approved ✓
        │                NO  → advance index
        │
        └── hybrid    → specific triggers OR percentage met?
                         YES → expense.status = approved ✓
                         NO  → advance index
```

---

*Document version 1.1 — Added Password & Account, Notifications, Comments & Activity Log, Reporting & Export, File & Receipt Management APIs.*
