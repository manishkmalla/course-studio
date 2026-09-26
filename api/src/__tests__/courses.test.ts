import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app.js";
import { createCourseFixture, registerAndLogin, truncateAll } from "./helpers.js";

afterEach(async () => {
  await truncateAll();
});

describe("creator route auth", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/api/courses")).status).toBe(401);
    expect((await request(app).post("/api/courses").send({ title: "t", description: "d" })).status).toBe(401);
    expect((await request(app).get(`/api/courses/${randomUUID()}`)).status).toBe(401);
    expect((await request(app).put(`/api/courses/${randomUUID()}`).send({})).status).toBe(401);
    expect((await request(app).post(`/api/courses/${randomUUID()}/publish`).send({})).status).toBe(401);
    expect((await request(app).get(`/api/courses/${randomUUID()}/stats`)).status).toBe(401);
  });

  it("returns 403 for a learner cookie", async () => {
    const cookie = await registerAndLogin("learner");
    const res = await request(app).get("/api/courses").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/courses", () => {
  it("creates a draft at version 1 with no lessons", async () => {
    const cookie = await registerAndLogin("creator");
    const res = await request(app)
      .post("/api/courses")
      .set("Cookie", cookie)
      .send({ title: "New Course", description: "About the course" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "New Course",
      status: "draft",
      version: 1,
      lessons: [],
    });
  });
});

describe("GET /api/courses", () => {
  it("paginates without duplicates or gaps", async () => {
    const cookie = await registerAndLogin("creator");
    for (let i = 0; i < 5; i++) {
      await createCourseFixture(cookie, { title: `Course ${i}` });
    }

    const seenIds = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;

    do {
      const res = await request(app)
        .get("/api/courses")
        .query({ limit: 2, ...(cursor ? { cursor } : {}) })
        .set("Cookie", cookie);
      expect(res.status).toBe(200);
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

describe("GET /api/courses/:id", () => {
  it("returns 404 for an unknown course", async () => {
    const cookie = await registerAndLogin("creator");
    const res = await request(app).get(`/api/courses/${randomUUID()}`).set("Cookie", cookie);
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/courses/:id", () => {
  it("inserts, updates, deletes and reorders lessons in one save", async () => {
    const cookie = await registerAndLogin("creator");
    const course = await createCourseFixture(cookie);

    const firstSave = await request(app)
      .put(`/api/courses/${course.id}`)
      .set("Cookie", cookie)
      .send({
        title: course.title,
        description: course.description,
        version: course.version,
        lessons: [
          { title: "Lesson A", body: "Body A" },
          { title: "Lesson B", body: "Body B" },
          { title: "Lesson C", body: "Body C" },
        ],
      });
    expect(firstSave.status).toBe(200);
    const [lessonA, lessonB, lessonC] = firstSave.body.lessons;

    // Drop B, update A's text, keep C, add a new D, and reorder to [C, A, D].
    const secondSave = await request(app)
      .put(`/api/courses/${course.id}`)
      .set("Cookie", cookie)
      .send({
        title: course.title,
        description: course.description,
        version: firstSave.body.version,
        lessons: [
          { id: lessonC.id, title: lessonC.title, body: lessonC.body },
          { id: lessonA.id, title: "Lesson A updated", body: "Body A updated" },
          { title: "Lesson D", body: "Body D" },
        ],
      });

    expect(secondSave.status).toBe(200);
    const lessons = secondSave.body.lessons;
    expect(lessons.map((l: { position: number }) => l.position)).toEqual([1, 2, 3]);
    expect(lessons.map((l: { title: string }) => l.title)).toEqual([
      lessonC.title,
      "Lesson A updated",
      "Lesson D",
    ]);
    expect(lessons.find((l: { id: string }) => l.id === lessonB.id)).toBeUndefined();
  });

  it("swaps the positions of two lessons correctly", async () => {
    const cookie = await registerAndLogin("creator");
    const course = await createCourseFixture(cookie);

    const created = await request(app)
      .put(`/api/courses/${course.id}`)
      .set("Cookie", cookie)
      .send({
        title: course.title,
        description: course.description,
        version: course.version,
        lessons: [
          { title: "Lesson 1", body: "Body 1" },
          { title: "Lesson 2", body: "Body 2" },
        ],
      });
    const [lesson1, lesson2] = created.body.lessons;

    const swapped = await request(app)
      .put(`/api/courses/${course.id}`)
      .set("Cookie", cookie)
      .send({
        title: course.title,
        description: course.description,
        version: created.body.version,
        lessons: [
          { id: lesson2.id, title: lesson2.title, body: lesson2.body },
          { id: lesson1.id, title: lesson1.title, body: lesson1.body },
        ],
      });

    expect(swapped.status).toBe(200);
    expect(swapped.body.lessons).toEqual([
      expect.objectContaining({ id: lesson2.id, position: 1 }),
      expect.objectContaining({ id: lesson1.id, position: 2 }),
    ]);
  });

  it("rejects an unknown lesson id with 400", async () => {
    const cookie = await registerAndLogin("creator");
    const course = await createCourseFixture(cookie);

    const res = await request(app)
      .put(`/api/courses/${course.id}`)
      .set("Cookie", cookie)
      .send({
        title: course.title,
        description: course.description,
        version: course.version,
        lessons: [{ id: randomUUID(), title: "Ghost", body: "Body" }],
      });

    expect(res.status).toBe(400);
  });

  it("rejects a lesson id belonging to another course with 400", async () => {
    const cookie = await registerAndLogin("creator");
    const courseA = await createCourseFixture(cookie, { title: "Course A" });
    const courseB = await createCourseFixture(cookie, { title: "Course B" });

    const saveA = await request(app)
      .put(`/api/courses/${courseA.id}`)
      .set("Cookie", cookie)
      .send({
        title: courseA.title,
        description: courseA.description,
        version: courseA.version,
        lessons: [{ title: "Lesson", body: "Body" }],
      });
    const lessonFromA = saveA.body.lessons[0];

    const res = await request(app)
      .put(`/api/courses/${courseB.id}`)
      .set("Cookie", cookie)
      .send({
        title: courseB.title,
        description: courseB.description,
        version: courseB.version,
        lessons: [{ id: lessonFromA.id, title: "Stolen", body: "Body" }],
      });

    expect(res.status).toBe(400);
  });

  it("rejects duplicate lesson ids in the same request with 400", async () => {
    const cookie = await registerAndLogin("creator");
    const course = await createCourseFixture(cookie);
    const saved = await request(app)
      .put(`/api/courses/${course.id}`)
      .set("Cookie", cookie)
      .send({
        title: course.title,
        description: course.description,
        version: course.version,
        lessons: [{ title: "Lesson", body: "Body" }],
      });
    const lesson = saved.body.lessons[0];

    const res = await request(app)
      .put(`/api/courses/${course.id}`)
      .set("Cookie", cookie)
      .send({
        title: course.title,
        description: course.description,
        version: saved.body.version,
        lessons: [
          { id: lesson.id, title: "One", body: "Body" },
          { id: lesson.id, title: "Two", body: "Body" },
        ],
      });

    expect(res.status).toBe(400);
  });

  it("returns 409 with the current course for a stale sequential save", async () => {
    const cookie = await registerAndLogin("creator");
    const course = await createCourseFixture(cookie);

    const firstSave = await request(app)
      .put(`/api/courses/${course.id}`)
      .set("Cookie", cookie)
      .send({ title: "First edit", description: course.description, version: course.version, lessons: [] });
    expect(firstSave.status).toBe(200);
    expect(firstSave.body.version).toBe(2);

    const staleSave = await request(app)
      .put(`/api/courses/${course.id}`)
      .set("Cookie", cookie)
      .send({ title: "Stale edit", description: course.description, version: course.version, lessons: [] });

    expect(staleSave.status).toBe(409);
    expect(staleSave.body.current).toMatchObject({ id: course.id, version: 2, title: "First edit" });
  });

  it("returns 404 for an unknown course", async () => {
    const cookie = await registerAndLogin("creator");
    const res = await request(app)
      .put(`/api/courses/${randomUUID()}`)
      .set("Cookie", cookie)
      .send({ title: "t", description: "d", version: 1, lessons: [] });
    expect(res.status).toBe(404);
  });

  it("resolves exactly one concurrent save with the same version, the rest with 409", async () => {
    const cookie = await registerAndLogin("creator");
    const course = await createCourseFixture(cookie);

    const attempts = Array.from({ length: 10 }, (_, i) =>
      request(app)
        .put(`/api/courses/${course.id}`)
        .set("Cookie", cookie)
        .send({
          title: `Concurrent edit ${i}`,
          description: course.description,
          version: course.version,
          lessons: [],
        }),
    );

    const results = await Promise.all(attempts);
    const ok = results.filter((r) => r.status === 200);
    const conflicts = results.filter((r) => r.status === 409);

    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(9);
    for (const conflict of conflicts) {
      expect(conflict.body.current).toMatchObject({ id: course.id, version: 2 });
    }
  });
});

describe("POST /api/courses/:id/publish", () => {
  async function courseWithOneLesson(cookie: string[]) {
    const course = await createCourseFixture(cookie);
    const saved = await request(app)
      .put(`/api/courses/${course.id}`)
      .set("Cookie", cookie)
      .send({
        title: course.title,
        description: course.description,
        version: course.version,
        lessons: [{ title: "Lesson", body: "Body" }],
      });
    return saved.body;
  }

  it("publishes a draft with lessons and bumps the version", async () => {
    const cookie = await registerAndLogin("creator");
    const course = await courseWithOneLesson(cookie);

    const res = await request(app)
      .post(`/api/courses/${course.id}/publish`)
      .set("Cookie", cookie)
      .send({ version: course.version });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("published");
    expect(res.body.version).toBe(course.version + 1);
    expect(res.body.publishedAt).toBeTruthy();
  });

  it("returns 409 for a stale version", async () => {
    const cookie = await registerAndLogin("creator");
    const course = await courseWithOneLesson(cookie);

    await request(app)
      .post(`/api/courses/${course.id}/publish`)
      .set("Cookie", cookie)
      .send({ version: course.version });

    const res = await request(app)
      .post(`/api/courses/${course.id}/publish`)
      .set("Cookie", cookie)
      .send({ version: course.version });

    expect(res.status).toBe(409);
    expect(res.body.current).toBeDefined();
  });

  it("rejects publishing a course with no lessons with 400", async () => {
    const cookie = await registerAndLogin("creator");
    const course = await createCourseFixture(cookie);

    const res = await request(app)
      .post(`/api/courses/${course.id}/publish`)
      .set("Cookie", cookie)
      .send({ version: course.version });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/courses/:id/stats", () => {
  async function publishedCourseWithTwoLessons(creatorCookie: string[]) {
    const course = await createCourseFixture(creatorCookie);
    const saved = await request(app)
      .put(`/api/courses/${course.id}`)
      .set("Cookie", creatorCookie)
      .send({
        title: course.title,
        description: course.description,
        version: course.version,
        lessons: [
          { title: "Lesson 1", body: "Body 1" },
          { title: "Lesson 2", body: "Body 2" },
        ],
      });
    const published = await request(app)
      .post(`/api/courses/${saved.body.id}/publish`)
      .set("Cookie", creatorCookie)
      .send({ version: saved.body.version });
    return published.body;
  }

  it("reports all zeros with no completions", async () => {
    const creatorCookie = await registerAndLogin("creator");
    const course = await publishedCourseWithTwoLessons(creatorCookie);

    const res = await request(app).get(`/api/courses/${course.id}/stats`).set("Cookie", creatorCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalLessons: 2,
      learnersStarted: 0,
      learnersCompleted: 0,
      completionRate: 0,
    });
  });

  it("counts started and completed learners correctly", async () => {
    const creatorCookie = await registerAndLogin("creator");
    const course = await publishedCourseWithTwoLessons(creatorCookie);
    const [lesson1, lesson2] = course.lessons;

    const finisher = await registerAndLogin("learner");
    const starter = await registerAndLogin("learner");

    await request(app).post(`/api/learn/lessons/${lesson1.id}/complete`).set("Cookie", finisher);
    await request(app).post(`/api/learn/lessons/${lesson2.id}/complete`).set("Cookie", finisher);
    await request(app).post(`/api/learn/lessons/${lesson1.id}/complete`).set("Cookie", starter);

    const res = await request(app).get(`/api/courses/${course.id}/stats`).set("Cookie", creatorCookie);

    expect(res.body).toEqual({
      totalLessons: 2,
      learnersStarted: 2,
      learnersCompleted: 1,
      completionRate: 0.5,
    });
  });

  it("reflects a lesson deletion in the completed denominator", async () => {
    const creatorCookie = await registerAndLogin("creator");
    const course = await publishedCourseWithTwoLessons(creatorCookie);
    const [lesson1, lesson2] = course.lessons;

    const learnerCookie = await registerAndLogin("learner");
    await request(app).post(`/api/learn/lessons/${lesson1.id}/complete`).set("Cookie", learnerCookie);
    await request(app).post(`/api/learn/lessons/${lesson2.id}/complete`).set("Cookie", learnerCookie);

    // Remove lesson2 from the course; the learner's completion of it cascades away too.
    await request(app)
      .put(`/api/courses/${course.id}`)
      .set("Cookie", creatorCookie)
      .send({
        title: course.title,
        description: course.description,
        version: course.version,
        lessons: [{ id: lesson1.id, title: lesson1.title, body: lesson1.body }],
      });

    const res = await request(app).get(`/api/courses/${course.id}/stats`).set("Cookie", creatorCookie);

    expect(res.body).toEqual({
      totalLessons: 1,
      learnersStarted: 1,
      learnersCompleted: 1,
      completionRate: 1,
    });
  });
});
