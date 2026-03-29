import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./errors";

type Ctx = QueryCtx | MutationCtx;

export function assertSameCompany(
  actor: Doc<"users">,
  companyId: Id<"companies">,
  message = "Cross-company access is not permitted."
): void {
  if (actor.company_id !== companyId) {
    fail("FORBIDDEN", message);
  }
}

export async function getUserInActorCompany(
  ctx: Ctx,
  actor: Doc<"users">,
  userId: Id<"users">
): Promise<Doc<"users">> {
  const user = await ctx.db.get(userId);
  if (!user) {
    fail("NOT_FOUND", "User not found.");
  }
  assertSameCompany(actor, user.company_id, "User belongs to a different company.");
  return user;
}

export async function getCompanyForActor(
  ctx: Ctx,
  actor: Doc<"users">
): Promise<Doc<"companies">> {
  const company = await ctx.db.get(actor.company_id);
  if (!company) {
    fail("NOT_FOUND", "Actor company not found.");
  }
  return company;
}
