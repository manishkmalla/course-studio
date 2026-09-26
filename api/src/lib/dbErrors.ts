import { DrizzleQueryError } from "drizzle-orm/errors";

export function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof DrizzleQueryError)) return false;
  const cause = err.cause as { code?: string } | undefined;
  return cause?.code === "23505";
}
