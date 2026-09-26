import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app.js";
import { requireRole, requireUser } from "../middleware/auth.js";
import { errorHandler } from "../middleware/errors.js";
import { truncateAll } from "./helpers.js";

afterEach(async () => {
  await truncateAll();
});

const validBody = { email: "learner@demo.test", password: "Password1" };

function setCookieHeader(res: request.Response): string[] {
  const value = res.headers["set-cookie"];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

describe("POST /api/auth/register", () => {
  it("creates a learner and returns it without the password hash", async () => {
    const res = await request(app).post("/api/auth/register").send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: "learner@demo.test", role: "learner" });
    expect(res.body).not.toHaveProperty("passwordHash");
    expect(res.body).not.toHaveProperty("password_hash");
  });

  it("ignores a role field in the request body", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...validBody, role: "creator" });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("learner");
  });

  it("rejects a duplicate email with 409", async () => {
    await request(app).post("/api/auth/register").send(validBody);
    const res = await request(app).post("/api/auth/register").send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toBeTypeOf("string");
  });

  it("rejects a differently-cased duplicate email with 409", async () => {
    await request(app).post("/api/auth/register").send(validBody);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...validBody, email: "Learner@Demo.Test" });

    expect(res.status).toBe(409);
  });

  it("rejects an invalid body with 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: "short" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials and sets an HttpOnly cookie", async () => {
    await request(app).post("/api/auth/register").send(validBody);

    const res = await request(app).post("/api/auth/login").send(validBody);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: "learner@demo.test", role: "learner" });
    const cookie = res.headers["set-cookie"]?.[0];
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("logs in regardless of email casing", async () => {
    await request(app).post("/api/auth/register").send(validBody);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ ...validBody, email: "LEARNER@demo.test" });

    expect(res.status).toBe(200);
  });

  it("returns a generic 401 for an unknown email", async () => {
    const res = await request(app).post("/api/auth/login").send(validBody);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("returns the same generic 401 for a wrong password", async () => {
    await request(app).post("/api/auth/register").send(validBody);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ ...validBody, password: "WrongPassword1" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the auth cookie", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(204);
    const cookie = res.headers["set-cookie"]?.[0];
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/token=;/);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the current user when authenticated", async () => {
    await request(app).post("/api/auth/register").send(validBody);
    const loginRes = await request(app).post("/api/auth/login").send(validBody);
    const cookie = setCookieHeader(loginRes);

    const res = await request(app).get("/api/auth/me").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: "learner@demo.test", role: "learner" });
  });

  it("returns 401 without a cookie", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
  });
});

describe("requireRole middleware", () => {
  it("returns 403 when the authenticated user has the wrong role", async () => {
    await request(app).post("/api/auth/register").send(validBody);
    const loginRes = await request(app).post("/api/auth/login").send(validBody);
    const cookie = setCookieHeader(loginRes);

    // Not a product route: a throwaway app wired with the real requireUser
    // and requireRole middleware, to exercise requireRole's 403 path without
    // adding a creator-only route that Phase 2 doesn't otherwise need.
    const testApp = express();
    testApp.use(cookieParser());
    testApp.get("/creator-only", requireUser, requireRole("creator"), (_req, res) => {
      res.status(200).json({ ok: true });
    });
    testApp.use(errorHandler);

    const res = await request(testApp).get("/creator-only").set("Cookie", cookie);

    expect(res.status).toBe(403);
  });
});
