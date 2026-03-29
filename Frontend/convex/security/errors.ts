export type AppErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "INVALID_STATE";

export class AppError extends Error {
  code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = "AppError";
    this.code = code;
  }
}

export function fail(code: AppErrorCode, message: string): never {
  throw new AppError(code, message);
}
