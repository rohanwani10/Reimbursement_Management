import { fail } from "./errors";

export type SupportedMode = "sequential" | "parallel";
export type SupportedCondition = "all" | "percentage" | "specific" | "hybrid";

export function isSupportedRuleSemantics(
  mode: SupportedMode,
  conditionType: SupportedCondition,
) {
  return mode === "sequential" && conditionType === "all";
}

export function assertSupportedRuleSemantics(
  mode: SupportedMode,
  conditionType: SupportedCondition,
) {
  if (!isSupportedRuleSemantics(mode, conditionType)) {
    fail(
      "VALIDATION_ERROR",
      "Only sequential mode with all conditionType is currently supported.",
      {
        mode,
        conditionType,
      },
    );
  }
}