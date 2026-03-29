import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type EnqueueNotificationArgs = {
  companyId: Id<"companies">;
  userId: Id<"users">;
  type: string;
  title: string;
  message: string;
  payload?: Record<string, unknown> | null;
  dedupeWindowMs?: number;
};

export async function enqueueNotification(
  ctx: MutationCtx,
  args: EnqueueNotificationArgs,
) {
  const now = Date.now();
  const dedupeWindowMs = args.dedupeWindowMs ?? 60_000;

  const recent = await ctx.db
    .query("notifications")
    .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", args.userId))
    .order("desc")
    .take(20);

  const duplicate = recent.find((entry) => {
    if (now - entry.createdAt > dedupeWindowMs) {
      return false;
    }

    const sameType = entry.type === args.type;
    const sameTitle = entry.title === args.title;
    const sameMessage = entry.message === args.message;
    return sameType && sameTitle && sameMessage;
  });

  if (duplicate) {
    return duplicate._id;
  }

  return await ctx.db.insert("notifications", {
    companyId: args.companyId,
    userId: args.userId,
    type: args.type,
    title: args.title,
    message: args.message,
    payload: args.payload ?? null,
    read: false,
    readAt: null,
    createdAt: now,
  });
}