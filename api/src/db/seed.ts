import bcrypt from "bcryptjs";
import { db, pool } from "./client.js";
import { courses, lessons, users } from "./schema.js";

const DEMO_PASSWORD = "Demo123!";

export async function seedIfEmpty(): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return;

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const [creator1, creator2, alice, bob] = await db
    .insert(users)
    .values([
      { email: "creator1@demo.test", passwordHash, role: "creator" },
      { email: "creator2@demo.test", passwordHash, role: "creator" },
      { email: "alice@demo.test", passwordHash, role: "learner" },
      { email: "bob@demo.test", passwordHash, role: "learner" },
    ])
    .returning();

  if (!creator1 || !creator2 || !alice || !bob) {
    throw new Error("Seed failed: expected 4 inserted users");
  }

  const [publishedCourse] = await db
    .insert(courses)
    .values({
      title: "Intro to Course Studio",
      description: "A short published course used for demos and manual testing.",
      status: "published",
      createdBy: creator1.id,
      updatedBy: creator1.id,
      publishedAt: new Date(),
    })
    .returning();

  const [draftCourse] = await db
    .insert(courses)
    .values({
      title: "Untitled Draft Course",
      description: "A course still being written, not visible to learners.",
      status: "draft",
      createdBy: creator2.id,
      updatedBy: creator2.id,
    })
    .returning();

  if (!publishedCourse || !draftCourse) {
    throw new Error("Seed failed: expected 2 inserted courses");
  }

  await db.insert(lessons).values([
    {
      courseId: publishedCourse.id,
      position: 1,
      title: "Welcome",
      body: "This is the first lesson of the published demo course.",
    },
    {
      courseId: publishedCourse.id,
      position: 2,
      title: "Core concepts",
      body: "This is the second lesson of the published demo course.",
    },
    {
      courseId: publishedCourse.id,
      position: 3,
      title: "Wrapping up",
      body: "This is the third and final lesson of the published demo course.",
    },
    {
      courseId: draftCourse.id,
      position: 1,
      title: "Draft outline",
      body: "Rough notes for the first lesson of the draft course.",
    },
    {
      courseId: draftCourse.id,
      position: 2,
      title: "More notes",
      body: "Rough notes for the second lesson of the draft course.",
    },
  ]);
}

const isMain = process.argv[1] && process.argv[1].endsWith("seed.ts");
if (isMain) {
  seedIfEmpty()
    .then(() => pool.end())
    .catch((err: unknown) => {
      console.error("Seed failed", err);
      process.exit(1);
    });
}
