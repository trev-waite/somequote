import { z } from 'zod/mini';

/** A string schema whose output carries the brand that `guard` proves. */
export function branded<T extends string>(guard: (value: string) => value is T, label: string) {
  return z.pipe(
    z.string(),
    z.transform((value: string, context): T => {
      if (guard(value)) return value;
      context.issues.push({ code: 'custom', message: `Invalid ${label}`, input: value });
      return z.NEVER;
    }),
  );
}
