import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireActor } from "./security/auth";
import { fail } from "./security/errors";
import { getCompanyForActor } from "./security/tenancy";

export const getCompany = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireActor(ctx);
    return await getCompanyForActor(ctx, actor);
  },
});

export const createCompany = mutation({
  args: { name: v.string(), currency: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);

    fail(
      "FORBIDDEN",
      `Additional company creation is disabled for this deployment. Admin ${actor._id} attempted to create '${args.name}'.`
    );
  },
});

export const updateCompany = mutation({
  args: {
    name: v.optional(v.string()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);

    const updates: { name?: string; currency?: string } = {};
    if (args.name !== undefined) {
      updates.name = args.name.trim();
    }
    if (args.currency !== undefined) {
      updates.currency = args.currency.trim().toUpperCase();
    }

    if (Object.keys(updates).length === 0) {
      return actor.company_id;
    }

    if (updates.name !== undefined && updates.name.length === 0) {
      fail("VALIDATION_ERROR", "Company name cannot be empty.");
    }
    if (updates.currency !== undefined && updates.currency.length < 3) {
      fail("VALIDATION_ERROR", "Currency code must be at least 3 characters.");
    }

    await ctx.db.patch(actor.company_id, updates);
    return actor.company_id;
  },
});
