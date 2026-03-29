export const USER_ROLES = ["admin", "manager", "employee"] as const;

export const USER_STATUSES = ["active", "inactive"] as const;

export const RULE_CONDITION_TYPES = [
  "all",
  "percentage",
  "specific",
  "hybrid",
] as const;

export const APPROVAL_MODES = ["sequential", "parallel"] as const;

export const EXPENSE_STATUSES = ["draft", "pending", "approved", "rejected"] as const;

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "skipped"] as const;

export const OCR_REQUEST_STATUSES = ["pending", "completed", "failed"] as const;

export const ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "INVALID_STATE",
] as const;

export const AUDIT_EVENT_NAMES = [
  "auth.bootstrap.started",
  "auth.bootstrap.completed",
  "user.created",
  "user.role_changed",
  "user.deactivated",
  "user.reactivated",
  "user.manager_assigned",
  "user.manager_removed",
  "rule.created",
  "rule.updated",
  "rule.activated",
  "rule.deactivated",
  "rule.approver_added",
  "rule.approver_removed",
  "expense.draft_created",
  "expense.draft_updated",
  "expense.draft_deleted",
  "expense.submitted",
  "expense.locked",
  "approval.step_approved",
  "approval.step_rejected",
  "approval.chain_advanced",
  "approval.completed",
  "approval.rejected",
  "approval.admin_override_approved",
  "approval.admin_override_rejected",
  "ocr.request_created",
  "ocr.request_sent",
  "ocr.request_completed",
  "ocr.request_failed",
  "notification.enqueued",
] as const;

export const REPORT_DEFAULT_LIMIT = 100;
export const QUERY_HARD_LIMIT = 500;