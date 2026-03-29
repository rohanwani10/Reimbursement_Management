import type { Doc, Id } from "./_generated/dataModel";
import type {
  APPROVAL_MODES,
  ERROR_CODES,
  EXPENSE_STATUSES,
  RULE_CONDITION_TYPES,
  USER_ROLES,
} from "./constants";

export type UserRole = (typeof USER_ROLES)[number];
export type RuleConditionType = (typeof RULE_CONDITION_TYPES)[number];
export type ApprovalMode = (typeof APPROVAL_MODES)[number];
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];
export type AppErrorCode = (typeof ERROR_CODES)[number];

export type ActorContext = {
  user: Doc<"users">;
  company: Doc<"companies">;
};

export type RuleResolution = {
  rule_id: Id<"approval_rules"> | null;
  approval_mode: ApprovalMode;
  approver_ids: Id<"users">[];
  used_admin_fallback: boolean;
};

export type RuleMatchInput = {
  company_id: Id<"companies">;
  category: string;
  amount: number;
};
