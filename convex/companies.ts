import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getCompany = query({
  args: { company_id: v.id("companies") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.company_id);
  },
});

export const createCompany = mutation({
  args: { name: v.string(), currency: v.string() },
  handler: async (ctx, args) => {
    const companyId = await ctx.db.insert("companies", {
      name: args.name,
      currency: args.currency,
    });
    return companyId;
  },
});

export const updateCompany = mutation({
  args: {
    company_id: v.id("companies"),
    name: v.optional(v.string()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { company_id, ...updates } = args;
    await ctx.db.patch(company_id, updates);
  },
});
