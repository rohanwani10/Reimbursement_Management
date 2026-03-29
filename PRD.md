# Product Requirements Document
# Reimbursement Management System

> **Version:** 1.0
> **Status:** Draft
> **Stack:** Python · FastAPI · PostgreSQL · React
> **Last Updated:** 2025-06-10

---

## Table of Contents

1. [Problem Statement & Goals](#1-problem-statement--goals)
2. [User Personas & Roles](#2-user-personas--roles)
3. [Functional Requirements](#3-functional-requirements)
   - 3.1 Authentication & Company Setup
   - 3.2 User Management
   - 3.3 Expense Submission
   - 3.4 Approval Workflow
   - 3.5 Approval Rules
   - 3.6 OCR Receipt Scanning
   - 3.7 Notifications
   - 3.8 Comments & Activity Log
   - 3.9 Reporting & Export
   - 3.10 File & Receipt Management
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [Out of Scope](#5-out-of-scope)

---

## 1. Problem Statement & Goals

### 1.1 Problem Statement

Companies often struggle with **manual expense reimbursement processes** that are time-consuming, error-prone, and lack transparency. Key pain points include:

- No structured way to define approval flows based on expense thresholds or categories.
- Multi-level approvals handled over email or chat — leading to lost requests and delays.
- Employees have no visibility into where their claim stands.
- Finance teams lack consolidated reporting on reimbursement spend.
- Receipt collection is manual and receipts are frequently lost.

### 1.2 Goals

| # | Goal | Success Metric |
|---|---|---|
| G1 | Reduce average reimbursement turnaround time | From ~5 days → under 2 days |
| G2 | Eliminate manual approval routing errors | 0 misrouted approvals post-launch |
| G3 | Give employees real-time claim visibility | 100% of claims have a visible status |
| G4 | Automate receipt data entry via OCR | ≥ 85% OCR field extraction accuracy |
| G5 | Provide finance teams with spend reporting | Monthly report generation < 30 seconds |

### 1.3 Non-Goals

- Payroll integration or direct bank transfers are not in scope for v1.
- The system does not handle tax calculation or compliance filing.

---

## 2. User Personas & Roles

### 2.1 Admin

**Who:** Company owner, HR, or Finance lead — the first person to sign up.

**Needs:**
- Set up the company and invite employees.
- Define approval rules per category and amount.
- Have full visibility and override capability over all expenses.

**Permissions:**

| Action | Allowed |
|---|---|
| Create company (auto on signup) | ✅ |
| Create / manage users & roles | ✅ |
| Define & edit approval rules | ✅ |
| View all expenses across company | ✅ |
| Override any approval | ✅ |
| Export reports | ✅ |

---

### 2.2 Manager

**Who:** Team lead or department head assigned to approve team expenses.

**Needs:**
- See pending approvals clearly with enough context to decide.
- Approve or reject with comments quickly.
- View team's expense history.

**Permissions:**

| Action | Allowed |
|---|---|
| Approve / reject expenses | ✅ (assigned expenses only) |
| View team expenses | ✅ (direct reports only) |
| View amounts in company's default currency | ✅ |
| Escalate per approval rules | ✅ |
| Modify approval rules | ❌ |
| View other teams' expenses | ❌ |

---

### 2.3 Employee

**Who:** Any staff member who incurs work-related expenses.

**Needs:**
- Submit claims quickly, ideally by scanning a receipt.
- Know the status of their claim without following up manually.
- Understand why a claim was rejected.

**Permissions:**

| Action | Allowed |
|---|---|
| Submit expense claims | ✅ |
| View own expense history | ✅ |
| Check approval status & comments | ✅ |
| Upload receipts | ✅ |
| View other employees' expenses | ❌ |
| Modify a submitted (non-draft) expense | ❌ |

---

## 3. Functional Requirements

---

### 3.1 Authentication & Company Setup

#### Requirements

| ID | Requirement |
|---|---|
| AUTH-01 | On first signup, a new **Company** and **Admin User** are auto-created together. |
| AUTH-02 | Company's default currency is set based on the selected country at signup using the restcountries API. |
| AUTH-03 | Users authenticate via email + password. JWT access tokens (short-lived) and refresh tokens (long-lived) are issued. |
| AUTH-04 | Password reset is available via a time-limited email token. |
| AUTH-05 | Authenticated users can change their own password by providing their current password. |
| AUTH-06 | Refresh tokens can be revoked on logout. |

#### Acceptance Criteria

- **AUTH-01:** Signing up with a new email creates exactly one Company and one Admin user in the same transaction. No orphan records.
- **AUTH-02:** Selecting "India" at signup sets `currency_code = INR` and `currency_symbol = ₹` on the company record.
- **AUTH-03:** Access token expires in 15 minutes. Refresh token expires in 7 days. Expired access tokens return `401`.
- **AUTH-04:** Reset token expires after 30 minutes. Using an expired or already-used token returns `400 INVALID_RESET_TOKEN`.
- **AUTH-05:** Submitting the wrong current password returns `401`. New password identical to the old returns `400 SAME_PASSWORD`.
- **AUTH-06:** After logout, using the revoked refresh token returns `401`.

---

### 3.2 User Management

#### Requirements

| ID | Requirement |
|---|---|
| USER-01 | Admin can create users with roles: `employee` or `manager`. |
| USER-02 | Admin can assign and change a user's role at any time. |
| USER-03 | Admin can define a manager relationship for each employee (who their direct manager is). |
| USER-04 | Admin can deactivate (soft-delete) users. Deactivated users cannot log in. |
| USER-05 | Each user belongs to exactly one company. Cross-company data access is prohibited. |
| USER-06 | A manager can be flagged as `is_manager_approver` — meaning they are automatically inserted as the first approver in the expense approval chain for their direct reports. |

#### Acceptance Criteria

- **USER-01:** Creating a user with a duplicate email within the same company returns `409 EMAIL_EXISTS`.
- **USER-02:** Changing an employee to manager role takes effect immediately on next login.
- **USER-03:** An employee without an assigned manager can still submit expenses; the approval chain skips manager prepend if `is_manager_approver` is false.
- **USER-04:** A deactivated user's in-progress approvals are flagged for admin reassignment. Their historical data is retained.
- **USER-05:** API requests with a valid token from Company A cannot read, write, or enumerate any records from Company B.
- **USER-06:** If `is_manager_approver = true` on the rule and the employee has a manager, the manager is inserted as `order = 0` in the approval chain.

---

### 3.3 Expense Submission

#### Requirements

| ID | Requirement |
|---|---|
| EXP-01 | Employees can submit expense claims with: Amount, Currency, Category, Description, Date, and optional Receipt. |
| EXP-02 | The submitted amount can be in any supported currency, not just the company's base currency. |
| EXP-03 | On submission, the system fetches the live exchange rate and converts the amount to the company's base currency. |
| EXP-04 | Expenses saved as `draft` are not sent for approval until explicitly submitted. |
| EXP-05 | Once submitted (status = `pending`), the expense is locked from edits by the employee. |
| EXP-06 | Employees can view their own expense history filtered by status, category, and date range. |
| EXP-07 | On submission, the system auto-matches the most applicable approval rule (by category and threshold) and builds the approval chain. |

#### Acceptance Criteria

- **EXP-01:** All required fields (Amount, Currency, Category, Date) must be present. Missing required fields return `422 VALIDATION_ERROR`.
- **EXP-02:** Supported currencies include at minimum: USD, EUR, GBP, INR, AUD, CAD, JPY, SGD.
- **EXP-03:** `converted_amount` and `exchange_rate` are stored at time of submission. Subsequent rate changes do not affect the stored values.
- **EXP-04:** Draft expenses do not appear in manager approval queues.
- **EXP-05:** Attempting to PATCH a submitted expense returns `403 EXPENSE_LOCKED`.
- **EXP-06:** Expense list API returns paginated results. Default page size is 20.
- **EXP-07:** If no rule matches, the expense is still submitted and routed to the admin for review.

---

### 3.4 Approval Workflow

#### Requirements

| ID | Requirement |
|---|---|
| APP-01 | Expenses move through approvers **sequentially** (one at a time) by default. |
| APP-02 | Each approver can **Approve** or **Reject** with a mandatory or optional comment. |
| APP-03 | A rejection at **any step** immediately sets the expense to `rejected` and halts the chain. |
| APP-04 | On full approval (all conditions met), the expense status is set to `approved`. |
| APP-05 | The next approver is notified only after the current approver acts. |
| APP-06 | Admin can override an approval at any stage, forcing `approved` or `rejected`. |
| APP-07 | The system supports **conditional approval logic**: `all`, `percentage`, `specific approver`, and `hybrid`. |
| APP-08 | Managers see amounts converted to the company's default currency, regardless of submitted currency. |

#### Acceptance Criteria

- **APP-01:** In a 3-step sequential chain, approver 2 receives no notification until approver 1 acts.
- **APP-02:** Rejection comment is optional but stored. Employees can read the rejection comment on their expense detail.
- **APP-03:** Rejecting at step 2 of a 3-step chain sets `expense.status = rejected` immediately. Step 3 approver receives no notification.
- **APP-04:** After the final approval step passes all conditions, `expense.status = approved` and the employee is notified.
- **APP-05:** Notification to next approver is triggered within 30 seconds of the current approver's action.
- **APP-06:** Admin override is logged in the activity log with actor, timestamp, and comment.
- **APP-07:** See detailed condition logic in section 3.5.
- **APP-08:** Manager approval view displays `converted_amount` + company `currency_symbol`.

---

### 3.5 Approval Rules

#### Requirements

| ID | Requirement |
|---|---|
| RULE-01 | Admin can create approval rules scoped by **category** and/or **amount threshold**. |
| RULE-02 | Rules support a configurable, ordered list of approvers. |
| RULE-03 | Rules support **sequential** (default) or **parallel** (simultaneous) approval modes. |
| RULE-04 | Condition type `all`: every approver must approve. |
| RULE-05 | Condition type `percentage`: expense is approved when X% of approvers have approved. |
| RULE-06 | Condition type `specific`: expense is auto-approved the moment a designated key approver approves, regardless of others. |
| RULE-07 | Condition type `hybrid`: expense is approved when the percentage threshold is met **OR** the specific approver approves — whichever comes first. |
| RULE-08 | Multiple rules and conditional flows can be combined (e.g. manager-first + percentage condition). |
| RULE-09 | Rule changes apply only to newly submitted expenses. In-flight expenses retain the rule snapshot at time of submission. |
| RULE-10 | Admin can deactivate rules without deleting them. |

#### Acceptance Criteria

- **RULE-01:** A rule with `category = Travel` and `amount_threshold = 500` matches any Travel expense ≥ $500. A Travel expense of $200 does not match this rule but may match a lower-threshold rule.
- **RULE-04:** With 3 approvers and `condition_type = all`, all 3 must approve. 2/3 approvals does not resolve the expense.
- **RULE-05:** With 5 approvers and `condition_percentage = 60`, any 3 approvals (60%) resolves the expense as approved.
- **RULE-06:** With `specific_approver_id = CFO_uuid`, the expense is approved the moment the CFO approves, even if no other approver has acted.
- **RULE-07:** Hybrid: expense with 5 approvers, 60% threshold, CFO as specific — resolves if CFO approves (even at step 1) OR if any 3 of 5 approve.
- **RULE-09:** Editing a rule's approver list does not change the approval chain of any expense already in `pending` status.
- **RULE-10:** Deactivated rules do not match new submissions. Existing expenses already using that rule are unaffected.

---

### 3.6 OCR Receipt Scanning

#### Requirements

| ID | Requirement |
|---|---|
| OCR-01 | Employees can upload a receipt image (JPEG, PNG, HEIC) or PDF (max 10 MB). |
| OCR-02 | The system extracts: Amount, Currency, Date, Vendor Name, and Category (heuristic). |
| OCR-03 | Extracted fields are presented to the employee for review and confirmation before submission — not auto-submitted. |
| OCR-04 | Raw OCR output is stored alongside the expense for audit purposes. |
| OCR-05 | If OCR confidence is below threshold (< 0.70), the employee is warned to verify all fields manually. |

#### Acceptance Criteria

- **OCR-01:** Uploading a file > 10 MB returns `413 FILE_TOO_LARGE`. Uploading an unsupported type returns `415 UNSUPPORTED_FILE_TYPE`.
- **OCR-02:** For a standard printed restaurant receipt, OCR correctly extracts amount and date at ≥ 85% accuracy in testing.
- **OCR-03:** The expense form is pre-filled with OCR results but all fields remain editable. The employee must explicitly submit.
- **OCR-04:** `ocr_raw` (JSONB) is stored on the expense record and visible to admin.
- **OCR-05:** API response includes a `confidence` score (0–1). UI displays a warning banner if `confidence < 0.70`.

---

### 3.7 Notifications

#### Requirements

| ID | Requirement |
|---|---|
| NOTIF-01 | In-app notifications are generated for all key expense lifecycle events. |
| NOTIF-02 | Email notifications are sent for: new approval request, expense approved, expense rejected. |
| NOTIF-03 | Users can configure their notification preferences (email on/off per event type, in-app on/off). |
| NOTIF-04 | Unread notification count is surfaced in the UI header. |
| NOTIF-05 | Users can mark notifications as read individually or all at once. |

#### Acceptance Criteria

- **NOTIF-01:** Submitting an expense generates a notification for the first approver within 30 seconds.
- **NOTIF-02:** Email delivery uses a transactional email provider (e.g. SendGrid). Failed deliveries are retried up to 3 times.
- **NOTIF-03:** Turning off `email_on_submission` stops email to approvers but does not affect in-app notifications.
- **NOTIF-04:** `unread_count` in `GET /notifications` reflects accurate real-time count.
- **NOTIF-05:** `POST /notifications/read-all` marks all unread notifications for that user as read in a single operation.

---

### 3.8 Comments & Activity Log

#### Requirements

| ID | Requirement |
|---|---|
| CMNT-01 | Any user with access to an expense can add a comment. |
| CMNT-02 | Comment authors can edit or delete their own comments. Admins can delete any comment. |
| CMNT-03 | Once an expense is resolved (approved/rejected), new comments are locked. |
| CMNT-04 | A full activity log is maintained per expense, combining system events and user comments in chronological order. |
| CMNT-05 | Activity log entries are immutable (no edits or deletes). |

#### Acceptance Criteria

- **CMNT-01:** An employee can comment on their own expense. A manager can comment on expenses they are assigned to approve.
- **CMNT-02:** Editing another user's comment returns `403 FORBIDDEN`.
- **CMNT-03:** Adding a comment to a resolved expense returns `409 COMMENT_LOCKED`.
- **CMNT-04:** Activity log includes events: `submitted`, `approved`, `rejected`, `overridden`, `comment`, `edited`, `rule_matched`, `escalated` — each with actor, timestamp, and description.
- **CMNT-05:** Activity log entries have no DELETE or PATCH endpoint.

---

### 3.9 Reporting & Export

#### Requirements

| ID | Requirement |
|---|---|
| RPT-01 | Admin and managers (team-scoped) can view aggregated expense reports by category, employee, status, or month. |
| RPT-02 | Admin can view an approval turnaround report showing average decision time per approver. |
| RPT-03 | Reports can be exported as **CSV** or **PDF**. |
| RPT-04 | Exports are generated asynchronously and available for download via a polling endpoint. |
| RPT-05 | Export download links expire after 15 minutes. |

#### Acceptance Criteria

- **RPT-01:** `group_by=category` returns one row per category with total amount, count, and breakdown by status.
- **RPT-02:** Turnaround report shows `avg_turnaround_hours` per approver over the selected date range.
- **RPT-03:** CSV export includes headers: `Expense ID, Employee, Category, Amount, Currency, Converted Amount, Status, Submitted Date, Resolved Date`.
- **RPT-04:** `POST /reports/export` returns `202` with an `export_id`. Polling `GET /reports/export/{id}` returns `status: ready` with a `download_url` when complete.
- **RPT-05:** Accessing an expired `download_url` returns `403` or `410`.

---

### 3.10 File & Receipt Management

#### Requirements

| ID | Requirement |
|---|---|
| FILE-01 | Employees can upload receipt files (JPEG, PNG, PDF, HEIC) up to 10 MB per file. |
| FILE-02 | Files are stored in object storage (e.g. S3/GCS) and referenced by URL on the expense record. |
| FILE-03 | Files can be deleted only while the expense is in `draft` status. |
| FILE-04 | Download access is provided via short-lived pre-signed URLs (15-minute expiry). |
| FILE-05 | Multiple files can be attached to a single expense. |

#### Acceptance Criteria

- **FILE-01:** Uploading a 15 MB file returns `413 FILE_TOO_LARGE`. Uploading a `.exe` returns `415 UNSUPPORTED_FILE_TYPE`.
- **FILE-02:** The stored `file_url` must remain accessible for the lifetime of the associated expense record.
- **FILE-03:** Attempting to delete a file attached to a `pending` or resolved expense returns `403 FILE_LOCKED`.
- **FILE-04:** Pre-signed URL is generated fresh on each `GET /files/{id}/download` call and expires in exactly 15 minutes.
- **FILE-05:** `GET /expenses/{id}/files` returns all files attached to the expense, ordered by `uploaded_at` ascending.

---

## 4. Non-Functional Requirements

### 4.1 Performance

| ID | Requirement | Target |
|---|---|---|
| PERF-01 | API response time (p95) for read endpoints | < 300ms |
| PERF-02 | API response time (p95) for write endpoints | < 500ms |
| PERF-03 | Expense list page load (up to 100 records) | < 1 second |
| PERF-04 | OCR processing time per receipt | < 10 seconds |
| PERF-05 | Report generation for up to 10,000 records | < 30 seconds |
| PERF-06 | System supports concurrent users | ≥ 500 simultaneous |

### 4.2 Security

| ID | Requirement |
|---|---|
| SEC-01 | All API communication over HTTPS/TLS 1.2+. |
| SEC-02 | Passwords hashed using bcrypt (min cost factor 12). |
| SEC-03 | JWT tokens signed with RS256. Access token TTL = 15 min. Refresh token TTL = 7 days. |
| SEC-04 | All endpoints enforce role-based access control (RBAC). No endpoint is accessible without a valid token except `/auth/signup`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, and `/utils/countries`. |
| SEC-05 | Company-level data isolation enforced at the database query layer — every query is scoped to `company_id`. |
| SEC-06 | File uploads are virus-scanned before being stored. |
| SEC-07 | Pre-signed URLs for file downloads expire in 15 minutes and are single-use where possible. |
| SEC-08 | Rate limiting applied to auth endpoints: max 10 requests/minute per IP on `/auth/login` and `/auth/forgot-password`. |
| SEC-09 | Sensitive fields (hashed_password, token_hash) are never returned in API responses. |
| SEC-10 | All admin override actions are logged immutably in the activity log. |

### 4.3 Scalability

| ID | Requirement |
|---|---|
| SCAL-01 | Application is stateless — horizontally scalable behind a load balancer. |
| SCAL-02 | Database connection pooling configured (min 5, max 20 per instance). |
| SCAL-03 | Async export and OCR processing handled via a background task queue (e.g. Celery + Redis). |
| SCAL-04 | File storage uses object storage (S3/GCS), not local disk. |
| SCAL-05 | Database indexes on: `expenses.employee_id`, `expenses.status`, `expenses.company_id`, `expense_approvals.approver_id`, `users.email`. |

### 4.4 Reliability & Availability

| ID | Requirement | Target |
|---|---|---|
| REL-01 | System uptime SLA | ≥ 99.5% monthly |
| REL-02 | Automated database backups | Daily, retained 30 days |
| REL-03 | Email notification delivery retry on failure | Up to 3 retries with exponential backoff |
| REL-04 | All database writes use transactions — no partial state on failure | |
| REL-05 | Health check endpoint available at `GET /health` | |

### 4.5 Usability

| ID | Requirement |
|---|---|
| USE-01 | UI must be responsive and usable on mobile browsers (receipt scanning use case). |
| USE-02 | Expense submission form must be completable in under 2 minutes without OCR. |
| USE-03 | All error messages returned by the API must be human-readable and actionable. |
| USE-04 | Date inputs and display must respect locale formatting. |

---

## 5. Out of Scope

The following are explicitly **not** included in v1 of this product:

| # | Out of Scope Item | Reason |
|---|---|---|
| OS-01 | Payroll integration or direct bank transfers | Requires banking partnerships; planned for v2 |
| OS-02 | Tax calculation or compliance reporting (GST, VAT) | High regional complexity; separate product stream |
| OS-03 | Mobile native app (iOS / Android) | Web-first approach for v1; mobile app in roadmap |
| OS-04 | SSO / SAML / OAuth login (Google, Microsoft) | Planned for v2 enterprise tier |
| OS-05 | Multi-currency company accounts (one company, multiple base currencies) | Single base currency per company for v1 |
| OS-06 | Expense policy enforcement (auto-reject over limit) | Rules engine handles approval routing only; hard limits out of scope |
| OS-07 | Integration with accounting software (QuickBooks, Xero, Tally) | Third-party integrations planned post-v1 |
| OS-08 | Budgets & budget tracking per department | Separate budgeting module; not part of reimbursement flow |
| OS-09 | Recurring or scheduled expenses | One-off expense claims only in v1 |
| OS-10 | Audit compliance exports (SOC2, ISO) | Enterprise feature; post-v1 roadmap |

---

*Document version 1.0 — Reimbursement Management PRD*
*Based on product spec, wireframes, and API design.*