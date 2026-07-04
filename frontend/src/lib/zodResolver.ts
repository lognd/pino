// Minimal react-hook-form Resolver backed by a zod schema -- written by
// hand instead of pulling in @hookform/resolvers (no new runtime deps per
// this build's scope; both zod and react-hook-form are already
// dependencies). Converts a zod flatten()'d error into RHF's
// FieldErrors shape so <Field errorMessage={...}> keeps working
// unchanged. Shared by Book.tsx's step-2 form and its unit tests.

import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { ZodType } from "zod";

export function zodResolver<T extends FieldValues>(schema: ZodType<T>): Resolver<T> {
  return async (values) => {
    const result = schema.safeParse(values);
    if (result.success) {
      return { values: result.data, errors: {} };
    }
    const errors: FieldErrors<T> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") as keyof T & string;
      if (!errors[path]) {
        // @ts-expect-error -- RHF's FieldErrors index type is intentionally loose here.
        errors[path] = { type: issue.code, message: issue.message };
      }
    }
    return { values: {}, errors };
  };
}
