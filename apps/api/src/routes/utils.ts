import type { ZodIssue } from "zod";

export function toValidationErrorResponse(issues: ZodIssue[]) {
  return {
    error: {
      code: "VALIDATION_ERROR",
      message: "VALIDATION_ERROR",
      fields: issues.map((i) => String(i.path[0] ?? "")),
    },
  } as const;
}

/**
 * Type helper that strips `| undefined` from optional property value types,
 * making the result compatible with `exactOptionalPropertyTypes: true`.
 *
 * Zod infers optional fields as `{ field?: T | undefined }`, but strict mode
 * requires `{ field?: T }` — this mapped type performs that conversion.
 */
type StrictOptional<T extends object> = {
  [K in keyof T as undefined extends T[K] ? K : never]+?: Exclude<T[K], undefined>;
} & {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
};

/**
 * Removes keys whose value is `undefined` from an object.
 * Required for `exactOptionalPropertyTypes: true` compatibility when spreading
 * Zod-parsed data (which types optional fields as `T | undefined`).
 */
export function omitUndefined<T extends object>(obj: T): StrictOptional<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as unknown as StrictOptional<T>;
}
