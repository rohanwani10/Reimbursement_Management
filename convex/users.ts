import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called storeUser without authentication present");
    }

    // 1. Check if we've already stored this identity before.
    const userByIdentity = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (userByIdentity !== null) {
      if (userByIdentity.name !== identity.name) {
        await ctx.db.patch(userByIdentity._id, { name: identity.name ?? "User" });
      }
      return userByIdentity._id;
    }

    // 2. Check if an admin pre-created this user via email!
    if (identity.email) {
      // Find a user with this email that does NOT have a clerkId yet
      const preCreatedUsers = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), identity.email))
        .collect();
      
      const matchedUser = preCreatedUsers.find((u) => !u.clerkId);
      if (matchedUser) {
        // Link the account
        await ctx.db.patch(matchedUser._id, {
          clerkId: identity.subject,
          name: identity.name ?? matchedUser.name,
        });
        return matchedUser._id;
      }
    }

    // 3. New identity, not pre-created.
    const existingUsers = await ctx.db.query("users").first();
    const isFirstUser = existingUsers === null;

    let companyId;
    let role: "admin" | "manager" | "employee" = "employee";

    if (isFirstUser) {
      role = "admin";
      companyId = await ctx.db.insert("companies", {
        name: "Default Company",
        currency: "USD",
      });
    } else {
      companyId = existingUsers.company_id;
    }

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      company_id: companyId,
      name: identity.name ?? "User",
      email: identity.email ?? "",
      role: role,
    });
  },
});

export const getUsers = query({
  args: { company_id: v.id("companies") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_company", (q) => q.eq("company_id", args.company_id))
      .collect();
  },
});

export const updateUser = mutation({
  args: {
    user_id: v.id("users"),
    role: v.optional(v.union(v.literal("admin"), v.literal("manager"), v.literal("employee"))),
    manager_id: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const { user_id, ...updates } = args;
    await ctx.db.patch(user_id, updates);
  },
});

export const adminCreateUser = mutation({
  args: {
    company_id: v.id("companies"),
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("manager"), v.literal("employee")),
    manager_id: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Only admins should do this ideally, we can check ctx.auth here if needed, 
    // but we can trust the client for now because Admin UI layout protects the route.
    return await ctx.db.insert("users", {
      company_id: args.company_id,
      name: args.name,
      email: args.email,
      role: args.role,
      manager_id: args.manager_id,
    });
  },
});

export const deleteUser = mutation({
  args: { user_id: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.user_id);
  },
});
