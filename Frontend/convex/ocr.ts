import { v } from "convex/values";
import { action, mutation } from "./_generated/server";

export const generateUploadUrl = mutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

export const processReceipt = action({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    // Generate a secure, short-lived URL from the storage ID
    const url = await ctx.storage.getUrl(args.storageId);
    
    if (!url) {
      throw new Error("Unable to retrieve file URL from storage");
    }

    // SIMULATION: Wait for 2 seconds to mimic an OCR API call delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // MOCK RESPONSE
    // In a real scenario, you would do:
    // const response = await fetch("https://api.mindee.net/v1/products/mindee/expense_receipts/v5/predict", { ... })
    // const data = await response.json();
    return {
      success: true,
      receipt_url: url,
      extracted: {
        amount: 85.50,
        currency: "USD",
        category: "Meals",
        expense_date: new Date().toISOString().split("T")[0], // Today
        description: "Business Lunch at TechCafe",
      },
      raw: "...", // raw OCR output
      confidence: 0.92,
    };
  },
});
