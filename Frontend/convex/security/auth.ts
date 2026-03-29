import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./errors";

type AuthCtx = QueryCtx | MutationCtx;

export async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    fail("UNAUTHORIZED", "Authentication is required to perform this operation.");
  }
  return identity;
}

export async function requireActor(ctx: AuthCtx): Promise<Doc<"users">> {
  const identity = await requireIdentity(ctx);
  const actor = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!actor) {
    fail(
      "UNAUTHORIZED",
      "No application user is linked to the authenticated identity."
    );
  }

  return actor;
}

export function requireAdminRole(actor: Doc<"users">): Doc<"users"> {
  if (actor.role !== "admin") {
    fail("FORBIDDEN", "Only administrators can perform this operation.");
  }
  return actor;
}

export async function requireAdmin(ctx: AuthCtx): Promise<Doc<"users">> {
  return requireAdminRole(await requireActor(ctx));
}
