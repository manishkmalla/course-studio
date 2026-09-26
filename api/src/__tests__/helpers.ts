import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import request from "supertest";
import { app } from "../app.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import type { CourseDetail } from "../services/courses.js";

export async function truncateAll(): Promise<void> {
  await db.execute(
    sql`truncate table lesson_completions, lessons, courses, users restart identity cascade`,
  );
}

export function setCookieHeader(res: request.Response): string[] {
  const value = res.headers["set-cookie"];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

const FIXTURE_PASSWORD = "Password1";

export async function registerAndLogin(role: "creator" | "learner"): Promise<string[]> {
  const email = `${role}-${randomUUID()}@example.test`;

  if (role === "learner") {
    await request(app).post("/api/auth/register").send({ email, password: FIXTURE_PASSWORD });
  } else {
    // Register always creates a learner, so a creator fixture has to be
    // inserted directly (creator accounts only ever come from the seed).
    const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 10);
    await db.insert(users).values({ email, passwordHash, role: "creator" });
  }

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email, password: FIXTURE_PASSWORD });
  return setCookieHeader(loginRes);
}

export async function createCourseFixture(
  cookie: string[],
  overrides: { title?: string; description?: string } = {},
): Promise<CourseDetail> {
  const res = await request(app)
    .post("/api/courses")
    .set("Cookie", cookie)
    .send({
      title: overrides.title ?? "Test Course",
      description: overrides.description ?? "A test course",
    });
  return res.body as CourseDetail;
}
