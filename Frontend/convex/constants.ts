export const USER_ROLES = ["admin", "manager", "employee"] as const;

export const RULE_CONDITION_TYPES = ["all", "percentage", "specific", "hybrid"] as const;

export const APPROVAL_MODES = ["sequential", "parallel"] as const;

export const EXPENSE_STATUSES = ["draft", "pending", "approved", "rejected"] as const;

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "skipped"] as const;

export const OCR_REQUEST_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;

export const ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "INVALID_STATE",
] as const;

export const REPORT_DEFAULT_LIMIT = 100;
export const QUERY_HARD_LIMIT = 500;
