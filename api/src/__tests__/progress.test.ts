import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app.js";
import { db } from "../db/client.js";
import { createCourseFixture, registerAndLogin, truncateAll } from "./helpers.js";

afterEach(async () => {
  await truncateAll();
});

async function publishedCourseWithLessons(creatorCookie: string[], lessonCount: number) {
  const course = await createCourseFixture(creatorCookie);
  const saved = await request(app)
    .put(`/api/courses/${course.id}`)
    .set("Cookie", creatorCookie)
    .send({
      title: course.title,
      description: course.description,
      version: course.version,
      lessons: Array.from({ length: lessonCount }, (_, i) => ({
        title: `Lesson ${i + 1}`,
        body: `Body ${i + 1}`,
      })),
    });
  const published = await request(app)
    .post(`/api/courses/${saved.body.id}/publish`)
    .set("Cookie", creatorCookie)
    .send({ version: saved.body.version });
  return published.body;
}

describe("learner route auth", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/api/learn/courses")).status).toBe(401);
    expect((await request(app).get(`/api/learn/courses/${randomUUID()}`)).status).toBe(401);
    expect((await request(app).post(`/api/learn/lessons/${randomUUID()}/complete`)).status).toBe(401);
  });

  it("returns 403 for a creator cookie", async () => {
    const cookie = await registerAndLogin("creator");
    const res = await request(app).get("/api/learn/courses").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/learn/courses", () => {
  it("excludes drafts and reports correct progress", async () => {
    const creatorCookie = await registerAndLogin("creator");
    await createCourseFixture(creatorCookie, { title: "Still a draft" });
    const published = await publishedCourseWithLessons(creatorCookie, 2);

    const learnerCookie = await registerAndLogin("learner");
    await request(app)
      .post(`/api/learn/lessons/${published.lessons[0].id}/complete`)
      .set("Cookie", learnerCookie);

    const res = await request(app).get("/api/learn/courses").set("Cookie", learnerCookie);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ id: published.id, progressPercent: 50 });
  });

  it("paginates without duplicates or gaps", async () => {
    const creatorCookie = await registerAndLogin("creator");
    for (let i = 0; i < 5; i++) {
      await publishedCourseWithLessons(creatorCookie, 1);
    }

    const learnerCookie = await registerAndLogin("learner");
    const seenIds = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;

    do {
      const res = await request(app)
        .get("/api/learn/courses")
        .query({ limit: 2, ...(cursor ? { cursor } : {}) })
        .set("Cookie", learnerCookie);
      for (const item of res.body.items) {
        expect(seenIds.has(item.id)).toBe(false);
        seenIds.add(item.id);
      }
      cursor = res.body.nextCursor;
      pages++;
      expect(pages).toBeLessThan(10);
    } while (cursor);

    expect(seenIds.size).toBe(5);
  });
});

describe("GET /api/learn/courses/:id", () => {
  it("returns 404 for a draft course", async () => {
    const creatorCookie = await registerAndLogin("creator");
    const draft = await createCourseFixture(creatorCookie);

    const learnerCookie = await registerAndLogin("learner");
    const res = await request(app).get(`/api/learn/courses/${draft.id}`).set("Cookie", learnerCookie);

    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown course", async () => {
    const learnerCookie = await registerAndLogin("learner");
    const res = await request(app)
      .get(`/api/learn/courses/${randomUUID()}`)
      .set("Cookie", learnerCookie);

    expect(res.status).toBe(404);
  });

  it("marks completed lessons per learner", async () => {
    const creatorCookie = await registerAndLogin("creator");
    const published = await publishedCourseWithLessons(creatorCookie, 2);

    const learnerCookie = await registerAndLogin("learner");
    await request(app)
      .post(`/api/learn/lessons/${published.lessons[0].id}/complete`)
      .set("Cookie", learnerCookie);

    const res = await request(app)
      .get(`/api/learn/courses/${published.id}`)
      .set("Cookie", learnerCookie);

    expect(res.status).toBe(200);
    expect(res.body.progressPercent).toBe(50);
    expect(res.body.lessons).toEqual([
      expect.objectContaining({ id: published.lessons[0].id, completed: true }),
      expect.objectContaining({ id: published.lessons[1].id, completed: false }),
    ]);
  });
});

describe("POST /api/learn/lessons/:id/complete", () => {
  it("returns 404 for a lesson in a draft course", async () => {
    const creatorCookie = await registerAndLogin("creator");
    const draft = await createCourseFixture(creatorCookie);
    const saved = await request(app)
      .put(`/api/courses/${draft.id}`)
      .set("Cookie", creatorCookie)
      .send({
        title: draft.title,
        description: draft.description,
        version: draft.version,
        lessons: [{ title: "Lesson", body: "Body" }],
      });

    const learnerCookie = await registerAndLogin("learner");
    const res = await request(app)
      .post(`/api/learn/lessons/${saved.body.lessons[0].id}/complete`)
      .set("Cookie", learnerCookie);

    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown lesson", async () => {
    const learnerCookie = await registerAndLogin("learner");
    const res = await request(app)
      .post(`/api/learn/lessons/${randomUUID()}/complete`)
      .set("Cookie", learnerCookie);

    expect(res.status).toBe(404);
  });

  it("is idempotent: repeat calls succeed and persist only one row", async () => {
    const creatorCookie = await registerAndLogin("creator");
    const published = await publishedCourseWithLessons(creatorCookie, 1);
    const lessonId = published.lessons[0].id;

    const learnerCookie = await registerAndLogin("learner");

    const first = await request(app)
      .post(`/api/learn/lessons/${lessonId}/complete`)
      .set("Cookie", learnerCookie);
    const second = await request(app)
      .post(`/api/learn/lessons/${lessonId}/complete`)
      .set("Cookie", learnerCookie);

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ completed: true });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ completed: true });

    const result = await db.execute<{ count: string }>(
      sql`select count(*) from lesson_completions where lesson_id = ${lessonId}`,
    );
    expect(Number(result.rows[0]?.count)).toBe(1);
  });
});
