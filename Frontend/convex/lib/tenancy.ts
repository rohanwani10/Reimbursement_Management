import type { Id } from "../_generated/dataModel";
import { fail } from "./errors";

export function requireSameCompany(
  resourceCompanyId: Id<"companies">,
  actorCompanyId: Id<"companies">,
) {
  if (resourceCompanyId !== actorCompanyId) {
    fail("FORBIDDEN", "Cross-company access is not allowed.");
  }
}