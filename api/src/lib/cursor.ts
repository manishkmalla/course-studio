import { z } from "zod";
import { HttpError } from "../middleware/errors.js";

export interface CursorKey {
  sortValue: string;
  id: string;
}

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify(key)).toString("base64url");
}

function isCursorKey(value: unknown): value is CursorKey {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).sortValue === "string" &&
    typeof (value as Record<string, unknown>).id === "string"
  );
}

export function decodeCursor(raw: string | undefined): CursorKey | undefined {
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid cursor");
  }

  if (!isCursorKey(parsed)) {
    throw new HttpError(400, "Invalid cursor");
  }
  return parsed;
}

export function buildPage<T>(
  rows: T[],
  limit: number,
  keyOf: (row: T) => CursorKey,
): { items: T[]; nextCursor?: string } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem ? encodeCursor(keyOf(lastItem)) : undefined;
  return { items, nextCursor };
}
