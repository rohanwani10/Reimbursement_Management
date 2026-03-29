import { fail } from "./errors";

export type AccessRole = "admin" | "manager" | "employee";

export function canViewApprovalChain(args: {
  actorRole: AccessRole;
  isExpenseOwner: boolean;
  isApprover: boolean;
}) {
  if (args.actorRole === "admin") {
    return true;
  }
  if (args.isExpenseOwner) {
    return true;
  }
  if (args.isApprover) {
    return true;
  }
  return false;
}

export function assertCanViewApprovalChain(args: {
  actorRole: AccessRole;
  isExpenseOwner: boolean;
  isApprover: boolean;
}) {
  if (!canViewApprovalChain(args)) {
    fail("FORBIDDEN", "You are not allowed to view this approval chain.");
  }
}

export function canMutateDraftExpense(args: {
  actorId: string;
  ownerId: string;
  status: "draft" | "pending" | "approved" | "rejected";
}) {
  return args.actorId === args.ownerId && args.status === "draft";
}
