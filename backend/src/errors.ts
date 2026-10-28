import type { ZodType } from "zod";

/** An error that is safe to show to the client. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public field?: string, public retryAfter?: number) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new HttpError(404, what);

/** Validates data with a zod schema; throws a 400 HttpError naming the bad field. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue.path.length ? String(issue.path[0]) : undefined;
  throw new HttpError(400, issue.message, field);
}

/** Parses a numeric id from a URL parameter. */
export function idParam(value: unknown, name = "id"): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${name}`, name);
  return n;
}
