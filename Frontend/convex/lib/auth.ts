import type { UserIdentity } from "convex/server";

import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertOrFail, fail } from "./errors";

type AuthContext =
  | Pick<QueryCtx, "auth" | "db">
  | Pick<MutationCtx, "auth" | "db">;

export async function requireIdentity(ctx: AuthContext): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || !identity.tokenIdentifier) {
    fail("UNAUTHORIZED", "Authentication is required.");
  }
  return identity;
}

export async function findUserByClerkUserId(
  ctx: AuthContext,
  clerkUserId: string,
) {
  const users = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
    .take(2);

  if (users.length > 1) {
    fail("CONFLICT", "Multiple users found for the same authenticated identity.", {
      clerkUserId,
    });
  }

  return users[0] ?? null;
}

export async function requireAuth(ctx: AuthContext) {
  const identity = await requireIdentity(ctx);
  const user = await findUserByClerkUserId(ctx, identity.tokenIdentifier);

  if (!user) {
    fail("FORBIDDEN", "Authenticated identity is not provisioned in this company.");
  }

  if (user.status !== "active") {
    fail("FORBIDDEN", "Inactive users cannot access backend operations.");
  }

  const company = await ctx.db.get(user.companyId);
  assertOrFail(company, "NOT_FOUND", "Company for authenticated user was not found.");

  if (!company.isActive) {
    fail("FORBIDDEN", "This company is inactive.");
  }

  return {
    tokenIdentifier: identity.tokenIdentifier,
    user,
    company,
  };
}

export async function getOptionalAuth(ctx: AuthContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || !identity.tokenIdentifier) {
    return null;
  }

  const user = await findUserByClerkUserId(ctx, identity.tokenIdentifier);
  if (!user || user.status !== "active") {
    return null;
  }

  const company = await ctx.db.get(user.companyId);
  if (!company || !company.isActive) {
    return null;
  }

  return {
    tokenIdentifier: identity.tokenIdentifier,
    user,
    company,
  };
}