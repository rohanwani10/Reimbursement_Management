import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type LogActivityArgs = {
  companyId: Id<"companies">;
  actorId: Id<"users">;
  entityType: string;
  entityId: string;
  action: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: number;
};

export async function logActivity(ctx: MutationCtx, args: LogActivityArgs) {
  const now = args.createdAt ?? Date.now();

  await ctx.db.insert("activityLog", {
    companyId: args.companyId,
    actorId: args.actorId,
    entityType: args.entityType,
    entityId: args.entityId,
    action: args.action,
    metadata: args.metadata ?? null,
    createdAt: now,
  });
}