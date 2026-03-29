import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdmin, requireIdentity } from "./security/auth";
import { fail } from "./security/errors";
import { getUserInActorCompany } from "./security/tenancy";

const roleValidator = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("employee")
);

export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);

    const userByIdentity = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (userByIdentity) {
      const updates: { name?: string; email?: string } = {};
      const nextName = identity.name ?? userByIdentity.name;
      const nextEmail = identity.email ?? userByIdentity.email;

      if (nextName !== userByIdentity.name) {
        updates.name = nextName;
      }
      if (nextEmail !== userByIdentity.email) {
        updates.email = nextEmail;
      }

      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(userByIdentity._id, updates);
      }

      return userByIdentity._id;
    }

    if (identity.email) {
      const sameEmail = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), identity.email))
        .collect();

      const unlinked = sameEmail.filter((u) => !u.clerkId);
      if (unlinked.length > 1) {
        fail(
          "CONFLICT",
          "Multiple pending users share this email. Resolve duplicates before sign-in."
        );
      }

      const matchedUser = unlinked[0];
      if (matchedUser) {
        await ctx.db.patch(matchedUser._id, {
          clerkId: identity.subject,
          name: identity.name ?? matchedUser.name,
          email: identity.email,
        });
        return matchedUser._id;
      }
    }

    const anyExistingUser = await ctx.db.query("users").first();
    if (anyExistingUser) {
      fail(
        "FORBIDDEN",
        "User is not provisioned. An administrator must create this account first."
      );
    }

    const companyId = await ctx.db.insert("companies", {
      name: "Default Company",
      currency: "USD",
    });

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      company_id: companyId,
      name: identity.name ?? "Admin",
      email: identity.email ?? "",
      role: "admin",
    });
  },
});

export const getUsers = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAdmin(ctx);

    return await ctx.db
      .query("users")
      .withIndex("by_company", (q) => q.eq("company_id", actor.company_id))
      .collect();
  },
});

export const updateUser = mutation({
  args: {
    user_id: v.id("users"),
    role: v.optional(roleValidator),
    manager_id: v.optional(v.id("users")),
    clear_manager: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const targetUser = await getUserInActorCompany(ctx, actor, args.user_id);

    if (args.manager_id && args.clear_manager) {
      fail("VALIDATION_ERROR", "Provide either manager_id or clear_manager, not both.");
    }

    if (args.manager_id) {
      const manager = await getUserInActorCompany(ctx, actor, args.manager_id);
      if (manager._id === targetUser._id) {
        fail("VALIDATION_ERROR", "A user cannot be their own manager.");
      }
      if (manager.role === "employee") {
        fail("VALIDATION_ERROR", "Selected manager must have admin or manager role.");
      }
    }

    const companyUsers = await ctx.db
      .query("users")
      .withIndex("by_company", (q) => q.eq("company_id", actor.company_id))
      .collect();

    const adminCount = companyUsers.filter((u) => u.role === "admin").length;

    if (args.role && targetUser.role === "admin" && args.role !== "admin" && adminCount <= 1) {
      fail("CONFLICT", "Cannot change role of the last administrator.");
    }

    if (args.role && targetUser._id === actor._id && args.role !== "admin") {
      fail("FORBIDDEN", "Administrators cannot remove their own admin role.");
    }

    const updates: {
      role?: "admin" | "manager" | "employee";
      manager_id?: Id<"users">;
    } = {};

    if (args.role) {
      updates.role = args.role;
    }

    if (args.clear_manager) {
      updates.manager_id = undefined;
    } else if (args.manager_id) {
      updates.manager_id = args.manager_id;
    }

    if (Object.keys(updates).length === 0) {
      return targetUser._id;
    }

    await ctx.db.patch(targetUser._id, updates);
    return targetUser._id;
  },
});

export const adminCreateUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    role: roleValidator,
    manager_id: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);

    const normalizedEmail = args.email.trim().toLowerCase();
    if (!normalizedEmail) {
      fail("VALIDATION_ERROR", "Email is required.");
    }

    const companyUsers = await ctx.db
      .query("users")
      .withIndex("by_company", (q) => q.eq("company_id", actor.company_id))
      .collect();

    const emailExists = companyUsers.some(
      (u) => u.email.trim().toLowerCase() === normalizedEmail
    );
    if (emailExists) {
      fail("CONFLICT", "A user with this email already exists in the company.");
    }

    if (args.manager_id) {
      const manager = await getUserInActorCompany(ctx, actor, args.manager_id);
      if (manager.role === "employee") {
        fail("VALIDATION_ERROR", "Selected manager must have admin or manager role.");
      }
    }

    return await ctx.db.insert("users", {
      company_id: actor.company_id,
      name: args.name.trim(),
      email: normalizedEmail,
      role: args.role,
      manager_id: args.manager_id,
    });
  },
});

export const deleteUser = mutation({
  args: { user_id: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const targetUser = await getUserInActorCompany(ctx, actor, args.user_id);

    if (targetUser._id === actor._id) {
      fail("FORBIDDEN", "Administrators cannot delete their own account.");
    }

    const companyUsers = await ctx.db
      .query("users")
      .withIndex("by_company", (q) => q.eq("company_id", actor.company_id))
      .collect();

    const adminCount = companyUsers.filter((u) => u.role === "admin").length;
    if (targetUser.role === "admin" && adminCount <= 1) {
      fail("CONFLICT", "Cannot delete the last administrator.");
    }

    if (targetUser.clerkId) {
      fail(
        "CONFLICT",
        "Cannot delete an active account. Reassign ownership and deactivate access first."
      );
    }

    const hasExpenses = await ctx.db
      .query("expenses")
      .withIndex("by_user", (q) => q.eq("user_id", targetUser._id))
      .first();

    if (hasExpenses) {
      fail(
        "CONFLICT",
        "Cannot delete user with existing expenses. Keep the record for audit integrity."
      );
    }

    const directReports = companyUsers.filter((u) => u.manager_id === targetUser._id);
    for (const report of directReports) {
      await ctx.db.patch(report._id, { manager_id: undefined });
    }

    await ctx.db.delete(targetUser._id);
    return targetUser._id;
  },
});
