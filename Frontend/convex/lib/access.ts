import { fail } from "./errors";

export function canViewApprovalChain(args: {
  actorRole: "admin" | "manager" | "employee";
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
  actorRole: "admin" | "manager" | "employee";
  isExpenseOwner: boolean;
  isApprover: boolean;
}) {
  if (!canViewApprovalChain(args)) {
    fail("FORBIDDEN", "You are not allowed to view this approval chain.");
  }
}