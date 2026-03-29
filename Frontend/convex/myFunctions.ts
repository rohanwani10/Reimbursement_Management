import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";

export const listNumbers = query({
    args: { count: v.number() },
    handler: async (ctx) => {
        return {
            viewer: (await ctx.auth.getUserIdentity())?.name ?? null,
            numbers: [1, 2, 3], // Dummy data
        };
    },
});

export const addNumber = mutation({
    args: { value: v.number() },
    handler: async (ctx, args) => {
        console.log("Dummy addNumber called with:", args.value);
    },
});

export const myAction = action({
    args: { first: v.number(), second: v.string() },
    handler: async () => {
        console.log("Dummy action called");
    },
});
