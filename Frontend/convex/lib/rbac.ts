import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { UserRole } from "../types";
import { requireAuth } from "./auth";
import { fail } from "./errors";
import { requireSameCompany as requireSameCompanyScope } from "./tenancy";

type RBACContext =
  | Pick<QueryCtx, "auth" | "db">
  | Pick<MutationCtx, "auth" | "db">;

export async function requireCompanyUser(ctx: RBACContext) {
  return await requireAuth(ctx);
}

export async function requireRole(ctx: RBACContext, role: UserRole | UserRole[]) {
  const actor = await requireAuth(ctx);
  const allowedRoles = Array.isArray(role) ? role : [role];

  if (!allowedRoles.includes(actor.user.role)) {
    fail("FORBIDDEN", "This operation is not permitted for the current role.", {
      requiredRoles: allowedRoles,
      actorRole: actor.user.role,
    });
  }

  return actor;
}

export function requireSameCompany(
  resourceCompanyId: Parameters<typeof requireSameCompanyScope>[0],
  actorCompanyId: Parameters<typeof requireSameCompanyScope>[1],
) {
  requireSameCompanyScope(resourceCompanyId, actorCompanyId);
}