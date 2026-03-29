import { describe, expect, it } from "vitest";

import { AppError } from "./errors";
import { assertSameCompany } from "./tenancy";

describe("assertSameCompany", () => {
  it("allows same company", () => {
    expect(() =>
      assertSameCompany(
        { company_id: "c1" } as unknown as Parameters<typeof assertSameCompany>[0],
        "c1" as unknown as Parameters<typeof assertSameCompany>[1]
      )
    ).not.toThrow();
  });

  it("throws FORBIDDEN for cross-company access", () => {
    expect(() =>
      assertSameCompany(
        { company_id: "c1" } as unknown as Parameters<typeof assertSameCompany>[0],
        "c2" as unknown as Parameters<typeof assertSameCompany>[1]
      )
    ).toThrow(AppError);
  });
});
