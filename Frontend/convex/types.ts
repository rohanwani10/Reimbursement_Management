import type { Doc, Id } from "./_generated/dataModel";
import type {
  APPROVAL_MODES,
  APPROVAL_STATUSES,
  ERROR_CODES,
  EXPENSE_STATUSES,
  OCR_REQUEST_STATUSES,
  RULE_CONDITION_TYPES,
  USER_ROLES,
  USER_STATUSES,
} from "./constants";

export type UserRole = (typeof USER_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
export type RuleConditionType = (typeof RULE_CONDITION_TYPES)[number];
export type ApprovalMode = (typeof APPROVAL_MODES)[number];
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type OcrRequestStatus = (typeof OCR_REQUEST_STATUSES)[number];
export type AppErrorCode = (typeof ERROR_CODES)[number];

export type ActorContext = {
  tokenIdentifier: string;
  user: Doc<"users">;
  company: Doc<"companies">;
};

export type RuleResolution = {
  ruleId: Id<"approvalRules"> | null;
  mode: ApprovalMode;
  approverIds: Id<"users">[];
  usedAdminFallback: boolean;
};

export type RuleMatchInput = {
  companyId: Id<"companies">;
  category: string;
  normalizedAmount: number;
};