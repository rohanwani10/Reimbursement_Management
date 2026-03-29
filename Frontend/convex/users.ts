import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { findUserByClerkUserId, requireAuth } from "./lib/auth";
import { logActivity } from "./lib/activity";
import { assertOrFail, fail } from "./lib/errors";
import { requireRole, requireSameCompany } from "./lib/rbac";

const USER_QUERY_LIMIT = 500;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function getCompanyUserOrFail(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  userId: Id<"users">,
) {
  const user = await ctx.db.get(userId);
  assertOrFail(user, "NOT_FOUND", "User does not exist.");
  requireSameCompany(user.companyId, companyId);
  return user;
}

async function ensureAnotherActiveAdminExists(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  excludingUserId: Id<"users">,
) {
  const users = await ctx.db
    .query("users")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .take(USER_QUERY_LIMIT);

  const activeAdmins = users.filter(
    (user) =>
      user._id !== excludingUserId && user.role === "admin" && user.status === "active",
  );

  if (activeAdmins.length === 0) {
    fail(
      "CONFLICT",
      "Operation blocked because the company must retain at least one active admin.",
    );
  }
}

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await requireAuth(ctx);
  },
});

export const listCompanyUsers = query({
  args: {
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", actor.company._id))
      .take(USER_QUERY_LIMIT);

    const filtered = args.includeInactive
      ? users
      : users.filter((user) => user.status === "active");

    return filtered.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const createUser = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("manager"), v.literal("employee")),
    managerId: v.optional(v.union(v.id("users"), v.null())),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const now = Date.now();
    const clerkUserId = args.clerkUserId.trim();
    const email = normalizeEmail(args.email);
    const name = args.name.trim();
    const managerId = args.managerId ?? null;

    if (!clerkUserId) {
      fail("VALIDATION_ERROR", "clerkUserId is required.");
    }
    if (!email) {
      fail("VALIDATION_ERROR", "email is required.");
    }
    if (!name) {
      fail("VALIDATION_ERROR", "name is required.");
    }

    const existingByEmail = await ctx.db
      .query("users")
      .withIndex("by_companyId_and_email", (q) =>
        q.eq("companyId", actor.company._id).eq("email", email),
      )
      .unique();
    if (existingByEmail) {
      fail("CONFLICT", "A user with this email already exists in this company.");
    }

    const existingByClerkUserId = await findUserByClerkUserId(ctx, clerkUserId);
    if (existingByClerkUserId) {
      fail("CONFLICT", "This Clerk identity is already provisioned.");
    }

    if (managerId !== null) {
      const manager = await getCompanyUserOrFail(ctx, actor.company._id, managerId);
      if (manager.status !== "active") {
        fail("VALIDATION_ERROR", "Assigned manager must be active.");
      }
      if (manager.role !== "manager" && manager.role !== "admin") {
        fail("VALIDATION_ERROR", "Assigned manager must have manager or admin role.");
      }
    }

    const newUserId = await ctx.db.insert("users", {
      companyId: actor.company._id,
      clerkUserId,
      email,
      name,
      role: args.role,
      status: "active",
      managerId,
      createdAt: now,
      updatedAt: now,
      deactivatedAt: null,
    });

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "user",
      entityId: newUserId,
      action: "user.created",
      metadata: {
        role: args.role,
      },
      createdAt: now,
    });

    return {
      userId: newUserId,
    };
  },
});

export const changeRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("manager"), v.literal("employee")),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const target = await getCompanyUserOrFail(ctx, actor.company._id, args.userId);

    if (target._id === actor.user._id && args.role !== "admin") {
      fail("CONFLICT", "You cannot demote your own admin role.");
    }

    if (target.role === "admin" && args.role !== "admin") {
      await ensureAnotherActiveAdminExists(ctx, actor.company._id, target._id);
    }

    if (target.role === args.role) {
      return { userId: target._id, role: target.role, changed: false };
    }

    const now = Date.now();
    await ctx.db.patch(target._id, {
      role: args.role,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "user",
      entityId: target._id,
      action: "user.role_changed",
      metadata: {
        previousRole: target.role,
        newRole: args.role,
      },
      createdAt: now,
    });

    return { userId: target._id, role: args.role, changed: true };
  },
});

export const deactivateUser = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const target = await getCompanyUserOrFail(ctx, actor.company._id, args.userId);

    if (target._id === actor.user._id) {
      fail("CONFLICT", "You cannot deactivate your own account.");
    }

    if (target.role === "admin" && target.status === "active") {
      await ensureAnotherActiveAdminExists(ctx, actor.company._id, target._id);
    }

    if (target.status === "inactive") {
      return { userId: target._id, status: target.status, changed: false };
    }

    const now = Date.now();
    await ctx.db.patch(target._id, {
      status: "inactive",
      deactivatedAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "user",
      entityId: target._id,
      action: "user.deactivated",
      metadata: null,
      createdAt: now,
    });

    return { userId: target._id, status: "inactive", changed: true };
  },
});

export const reactivateUser = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const target = await getCompanyUserOrFail(ctx, actor.company._id, args.userId);

    if (target.status === "active") {
      return { userId: target._id, status: target.status, changed: false };
    }

    const now = Date.now();
    await ctx.db.patch(target._id, {
      status: "active",
      deactivatedAt: null,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "user",
      entityId: target._id,
      action: "user.reactivated",
      metadata: null,
      createdAt: now,
    });

    return { userId: target._id, status: "active", changed: true };
  },
});

export const assignManager = mutation({
  args: {
    employeeId: v.id("users"),
    managerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");

    if (args.employeeId === args.managerId) {
      fail("VALIDATION_ERROR", "A user cannot be their own manager.");
    }

    const employee = await getCompanyUserOrFail(ctx, actor.company._id, args.employeeId);
    const manager = await getCompanyUserOrFail(ctx, actor.company._id, args.managerId);

    if (employee.role !== "employee") {
      fail("VALIDATION_ERROR", "Manager assignment is only valid for employees.");
    }
    if (manager.role !== "manager" && manager.role !== "admin") {
      fail("VALIDATION_ERROR", "Assigned manager must be manager or admin.");
    }
    if (employee.status !== "active" || manager.status !== "active") {
      fail("INVALID_STATE", "Employee and manager must both be active.");
    }

    const now = Date.now();
    await ctx.db.patch(employee._id, {
      managerId: manager._id,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "user",
      entityId: employee._id,
      action: "user.manager_assigned",
      metadata: {
        managerId: manager._id,
      },
      createdAt: now,
    });

    return {
      employeeId: employee._id,
      managerId: manager._id,
    };
  },
});

export const removeManager = mutation({
  args: {
    employeeId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, "admin");
    const employee = await getCompanyUserOrFail(ctx, actor.company._id, args.employeeId);

    if (employee.role !== "employee") {
      fail("VALIDATION_ERROR", "Manager assignment is only valid for employees.");
    }

    if (employee.managerId === null) {
      return {
        employeeId: employee._id,
        managerId: null,
        changed: false,
      };
    }

    const now = Date.now();
    await ctx.db.patch(employee._id, {
      managerId: null,
      updatedAt: now,
    });

    await logActivity(ctx, {
      companyId: actor.company._id,
      actorId: actor.user._id,
      entityType: "user",
      entityId: employee._id,
      action: "user.manager_removed",
      metadata: null,
      createdAt: now,
    });

    return {
      employeeId: employee._id,
      managerId: null,
      changed: true,
    };
  },
});
