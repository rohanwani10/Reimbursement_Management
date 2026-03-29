/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as approvalRules from "../approvalRules.js";
import type * as approvals from "../approvals.js";
import type * as auth from "../auth.js";
import type * as companies from "../companies.js";
import type * as constants from "../constants.js";
import type * as expenses from "../expenses.js";
import type * as ocr from "../ocr.js";
import type * as reporting from "../reporting.js";
import type * as ruleEngine from "../ruleEngine.js";
import type * as security_access from "../security/access.js";
import type * as security_auth from "../security/auth.js";
import type * as security_errors from "../security/errors.js";
import type * as security_tenancy from "../security/tenancy.js";
import type * as types from "../types.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  approvalRules: typeof approvalRules;
  approvals: typeof approvals;
  auth: typeof auth;
  companies: typeof companies;
  constants: typeof constants;
  expenses: typeof expenses;
  ocr: typeof ocr;
  reporting: typeof reporting;
  ruleEngine: typeof ruleEngine;
  "security/access": typeof security_access;
  "security/auth": typeof security_auth;
  "security/errors": typeof security_errors;
  "security/tenancy": typeof security_tenancy;
  types: typeof types;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
