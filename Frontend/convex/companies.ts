import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { findUserByClerkUserId, requireAuth, requireIdentity } from "./lib/auth";
import { logActivity } from "./lib/activity";
import { assertOrFail, fail } from "./lib/errors";

const COMPANY_NAME_MAX_LENGTH = 120;

export const getBootstrapState = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.tokenIdentifier) {
      return {
        authenticated: false,
        provisioned: false,
        companyId: null,
        userId: null,
      };
    }

    const user = await findUserByClerkUserId(ctx, identity.tokenIdentifier);
    if (!user) {
      return {
        authenticated: true,
        provisioned: false,
        companyId: null,
        userId: null,
      };
    }

    return {
      authenticated: true,
      provisioned: true,
      companyId: user.companyId,
      userId: user._id,
    };
  },
});

export const bootstrapCurrentSession = mutation({
  args: {
    companyName: v.string(),
    countryCode: v.string(),
    currencyCode: v.string(),
    currencySymbol: v.string(),
    userName: v.optional(v.string()),
    userEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const now = Date.now();
    const existingUser = await findUserByClerkUserId(ctx, identity.tokenIdentifier);

    if (existingUser) {
      const company = await ctx.db.get(existingUser.companyId);
      assertOrFail(company, "NOT_FOUND", "Provisioned company could not be found.");

      return {
        created: false,
        companyId: company._id,
        userId: existingUser._id,
        role: existingUser.role,
      };
    }

    const companyName = args.companyName.trim();
    const countryCode = args.countryCode.trim().toUpperCase();
    const currencyCode = args.currencyCode.trim().toUpperCase();
    const currencySymbol = args.currencySymbol.trim();

    if (!companyName || companyName.length > COMPANY_NAME_MAX_LENGTH) {
      fail("VALIDATION_ERROR", "Company name is required and must be concise.");
    }
    if (!countryCode) {
      fail("VALIDATION_ERROR", "Country code is required.");
    }
    if (!currencyCode) {
      fail("VALIDATION_ERROR", "Currency code is required.");
    }
    if (!currencySymbol) {
      fail("VALIDATION_ERROR", "Currency symbol is required.");
    }

    const resolvedEmail =
      args.userEmail?.trim().toLowerCase() ?? identity.email?.trim().toLowerCase() ?? null;
    if (!resolvedEmail) {
      fail("VALIDATION_ERROR", "An email address is required for bootstrap.");
    }

    const resolvedName =
      args.userName?.trim() ?? identity.name?.trim() ?? resolvedEmail.split("@")[0];
    if (!resolvedName) {
      fail("VALIDATION_ERROR", "A user name is required for bootstrap.");
    }

    const companyId = await ctx.db.insert("companies", {
      name: companyName,
      countryCode,
      currencyCode,
      currencySymbol,
      createdByUserId: null,
      isActive: true,
      bootstrapCompletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    // Recheck identity mapping before inserting user to keep bootstrap idempotent
    // under retries and concurrent invocations.
    const existingAfterCompanyInsert = await findUserByClerkUserId(
      ctx,
      identity.tokenIdentifier,
    );
    if (existingAfterCompanyInsert) {
      await ctx.db.delete(companyId);
      const company = await ctx.db.get(existingAfterCompanyInsert.companyId);
      assertOrFail(company, "NOT_FOUND", "Provisioned company could not be found.");
      return {
        created: false,
        companyId: company._id,
        userId: existingAfterCompanyInsert._id,
        role: existingAfterCompanyInsert.role,
      };
    }

    const userId = await ctx.db.insert("users", {
      companyId,
      clerkUserId: identity.tokenIdentifier,
      email: resolvedEmail,
      name: resolvedName,
      role: "admin",
      status: "active",
      managerId: null,
      createdAt: now,
      updatedAt: now,
      deactivatedAt: null,
    });

    const userInvariantCheck = await findUserByClerkUserId(ctx, identity.tokenIdentifier);
    assertOrFail(
      userInvariantCheck,
      "CONFLICT",
      "Bootstrap failed identity uniqueness invariant check.",
    );

    await ctx.db.patch(companyId, {
      createdByUserId: userId,
      bootstrapCompletedAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId,
      actorId: userId,
      entityType: "company",
      entityId: companyId,
      action: "auth.bootstrap.started",
      metadata: {
        clerkUserId: identity.tokenIdentifier,
      },
      createdAt: now,
    });

    await logActivity(ctx, {
      companyId,
      actorId: userId,
      entityType: "company",
      entityId: companyId,
      action: "auth.bootstrap.completed",
      metadata: {
        userId,
      },
      createdAt: now,
    });

    return {
      created: true,
      companyId,
      userId,
      role: "admin" as const,
    };
  },
});

export const getCurrentCompanyContext = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAuth(ctx);
    return {
      company: actor.company,
      user: actor.user,
      tokenIdentifier: actor.tokenIdentifier,
    };
  },
});
