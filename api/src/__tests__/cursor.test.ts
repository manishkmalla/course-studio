import { describe, expect, it } from "vitest";
import { buildPage, decodeCursor, encodeCursor } from "../lib/cursor.js";
import { HttpError } from "../middleware/errors.js";

describe("encodeCursor / decodeCursor", () => {
  it("round-trips a cursor key", () => {
    const key = { sortValue: "2024-01-01T00:00:00.000Z", id: "abc-123" };
    expect(decodeCursor(encodeCursor(key))).toEqual(key);
  });

  it("returns undefined for an undefined cursor", () => {
    expect(decodeCursor(undefined)).toBeUndefined();
  });

  it("rejects malformed input with a 400 HttpError", () => {
    expect(() => decodeCursor("not-a-valid-cursor!!!")).toThrow(HttpError);
  });

  it("rejects a well-formed but wrong-shape payload", () => {
    const wrongShape = Buffer.from(JSON.stringify({ foo: "bar" })).toString("base64url");
    expect(() => decodeCursor(wrongShape)).toThrow(HttpError);
  });
});

describe("buildPage", () => {
  const rows = [1, 2, 3].map((n) => ({
    id: String(n),
    sortValue: `2024-01-0${n}T00:00:00.000Z`,
  }));

  it("returns no nextCursor when all rows fit within the limit", () => {
    const page = buildPage(rows, 3, (row) => row);
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeUndefined();
  });

  it("trims to the limit and returns a nextCursor when there are more rows", () => {
    const page = buildPage(rows, 2, (row) => row);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeDefined();
    expect(decodeCursor(page.nextCursor)).toEqual(rows[1]);
  });
});
