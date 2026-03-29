import { ConvexError, type Value } from "convex/values";

import type { AppErrorCode } from "../types";

export type ErrorPayload = {
  code: AppErrorCode;
  message: string;
  details?: Value | null;
};

export class AppError extends ConvexError<ErrorPayload> {
  public readonly code: AppErrorCode;

  constructor(
    code: AppErrorCode,
    message: string,
    details?: Value | null,
  ) {
    super({ code, message, details: details ?? null });
    this.code = code;
  }
}

export function fail(
  code: AppErrorCode,
  message: string,
  details?: Value | null,
): never {
  throw new AppError(code, message, details);
}

export function assertOrFail(
  condition: unknown,
  code: AppErrorCode,
  message: string,
  details?: Value | null,
): asserts condition {
  if (!condition) {
    fail(code, message, details);
  }
}