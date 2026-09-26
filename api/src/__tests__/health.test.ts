import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app.js";
import { truncateAll } from "./helpers.js";

afterEach(async () => {
  await truncateAll();
});

describe("GET /api/health", () => {
  it("returns ok status with a real db check", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "ok" });
  });
});
