import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { buildPage, decodeCursor, type PaginationQuery } from "../lib/cursor.js";
import { db } from "../db/client.js";
import { courses, lessonCompletions, lessons } from "../db/schema.js";
import { HttpError } from "../middleware/errors.js";

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CourseRow = typeof courses.$inferSelect;
type LessonRow = typeof lessons.$inferSelect;

export interface CourseDetail extends CourseRow {
  lessons: LessonRow[];
}

export interface LessonInput {
  id?: string;
  title: string;
  body: string;
}

export interface SaveCourseInput {
  title: string;
  description: string;
  lessons: LessonInput[];
}

async function fetchCourseDetail(
  executor: Executor | typeof db,
  courseId: string,
): Promise<CourseDetail | undefined> {
  const [course] = await executor.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) return undefined;

  const lessonRows = await executor
    .select()
    .from(lessons)
    .where(eq(lessons.courseId, courseId))
    .orderBy(lessons.position);

  return { ...course, lessons: lessonRows };
}

export async function listCourses({ cursor, limit }: PaginationQuery) {
  const decoded = decodeCursor(cursor);

  const rows = await db
    .select()
    .from(courses)
    .where(
      decoded
        ? sql`(${courses.updatedAt}, ${courses.id}) < (${decoded.sortValue}::timestamptz, ${decoded.id}::uuid)`
        : undefined,
    )
    .orderBy(desc(courses.updatedAt), desc(courses.id))
    .limit(limit + 1);

  return buildPage(rows, limit, (row) => ({ sortValue: row.updatedAt.toISOString(), id: row.id }));
}

export async function createCourse(
  title: string,
  description: string,
  userId: string,
): Promise<CourseDetail> {
  const [course] = await db
    .insert(courses)
    .values({ title, description, createdBy: userId, updatedBy: userId })
    .returning();

  if (!course) throw new Error("Insert returned no row");
  return { ...course, lessons: [] };
}

export async function getCourse(courseId: string): Promise<CourseDetail> {
  const course = await fetchCourseDetail(db, courseId);
  if (!course) throw new HttpError(404, "Course not found");
  return course;
}

// Runs the version-checked UPDATE and, on a miss, tells "course doesn't
// exist" (404) apart from "someone else saved a newer version first" (409,
// with that newer version so the UI can show the conflict). A miss can only
// mean one of these two things: either the row never existed, or a
// concurrent save already claimed this version number.
async function applyVersionedUpdate(
  tx: Executor,
  courseId: string,
  expectedVersion: number,
  set: Record<string, unknown>,
): Promise<CourseRow> {
  const [updated] = await tx
    .update(courses)
    .set(set)
    .where(and(eq(courses.id, courseId), eq(courses.version, expectedVersion)))
    .returning();

  if (updated) return updated;

  const current = await fetchCourseDetail(tx, courseId);
  if (!current) throw new HttpError(404, "Course not found");
  throw new HttpError(409, "Version conflict", { current });
}

export async function saveCourse(
  courseId: string,
  expectedVersion: number,
  data: SaveCourseInput,
  userId: string,
): Promise<CourseDetail> {
  return db.transaction(async (tx) => {
    const updated = await applyVersionedUpdate(tx, courseId, expectedVersion, {
      title: data.title,
      description: data.description,
      version: sql`${courses.version} + 1`,
      updatedBy: userId,
      updatedAt: sql`now()`,
    });

    const requestedIds = data.lessons
      .map((lesson) => lesson.id)
      .filter((id): id is string => id !== undefined);

    if (requestedIds.length > 0) {
      const owned = await tx
        .select({ id: lessons.id, courseId: lessons.courseId })
        .from(lessons)
        .where(inArray(lessons.id, requestedIds));
      const ownerOf = new Map(owned.map((row) => [row.id, row.courseId]));

      for (const id of requestedIds) {
        const owner = ownerOf.get(id);
        if (!owner) throw new HttpError(400, `Lesson ${id} not found`);
        if (owner !== courseId) throw new HttpError(400, `Lesson ${id} belongs to another course`);
      }
    }

    // Step 1: negate the position of every lesson we're keeping. Positions
    // were already unique per course, so their negatives are too — this
    // vacates the whole positive range for this course without ever
    // deleting a kept lesson (which would cascade-delete its completions).
    if (requestedIds.length > 0) {
      await tx
        .update(lessons)
        .set({ position: sql`-${lessons.position}` })
        .where(inArray(lessons.id, requestedIds));
    }

    // Step 2: delete lessons dropped from the request (cascades their completions).
    await tx
      .delete(lessons)
      .where(
        requestedIds.length > 0
          ? and(eq(lessons.courseId, courseId), notInArray(lessons.id, requestedIds))
          : eq(lessons.courseId, courseId),
      );

    // Step 3: brand-new lessons go straight to their final position — nothing
    // positive is occupied for this course at this point.
    const newLessons = data.lessons
      .map((lesson, index) => ({ lesson, position: index + 1 }))
      .filter((entry) => entry.lesson.id === undefined);

    if (newLessons.length > 0) {
      await tx.insert(lessons).values(
        newLessons.map(({ lesson, position }) => ({
          courseId,
          title: lesson.title,
          body: lesson.body,
          position,
        })),
      );
    }

    // Step 4: move kept lessons from their temporary negative position to
    // their final one, and update their text. Every other row already sits
    // at a distinct position (negative or final), so no collision.
    const keptLessons = data.lessons
      .map((lesson, index) => ({ lesson, position: index + 1 }))
      .filter((entry) => entry.lesson.id !== undefined);

    for (const { lesson, position } of keptLessons) {
      await tx
        .update(lessons)
        .set({ title: lesson.title, body: lesson.body, position })
        .where(eq(lessons.id, lesson.id as string));
    }

    const lessonRows = await tx
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, courseId))
      .orderBy(lessons.position);

    return { ...updated, lessons: lessonRows };
  });
}

export async function publishCourse(
  courseId: string,
  expectedVersion: number,
  userId: string,
): Promise<CourseDetail> {
  return db.transaction(async (tx) => {
    // Checked before the version bump: a course with no lessons has
    // nothing for a 404 or use up a version number on a request that was
    // always going to fail.
    const [lessonCount] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(lessons)
      .where(eq(lessons.courseId, courseId));

    if (Number(lessonCount?.count ?? 0) === 0) {
      const current = await fetchCourseDetail(tx, courseId);
      if (!current) throw new HttpError(404, "Course not found");
      throw new HttpError(400, "Cannot publish a course with no lessons");
    }

    const updated = await applyVersionedUpdate(tx, courseId, expectedVersion, {
      status: "published",
      publishedAt: sql`coalesce(${courses.publishedAt}, now())`,
      version: sql`${courses.version} + 1`,
      updatedBy: userId,
      updatedAt: sql`now()`,
    });

    const lessonRows = await tx
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, courseId))
      .orderBy(lessons.position);

    return { ...updated, lessons: lessonRows };
  });
}

export interface CourseStats {
  totalLessons: number;
  learnersStarted: number;
  learnersCompleted: number;
  completionRate: number;
}

export async function getCourseStats(courseId: string): Promise<CourseStats> {
  const course = await fetchCourseDetail(db, courseId);
  if (!course) throw new HttpError(404, "Course not found");

  const totalLessons = course.lessons.length;

  const [startedRow] = await db
    .select({ started: sql<number>`count(distinct ${lessonCompletions.userId})` })
    .from(lessonCompletions)
    .innerJoin(lessons, eq(lessons.id, lessonCompletions.lessonId))
    .where(eq(lessons.courseId, courseId));
  const started = startedRow?.started ?? 0;

  let completed = 0;
  if (totalLessons > 0) {
    const completedRows = await db
      .select({ userId: lessonCompletions.userId, count: sql<number>`count(*)` })
      .from(lessonCompletions)
      .innerJoin(lessons, eq(lessons.id, lessonCompletions.lessonId))
      .where(eq(lessons.courseId, courseId))
      .groupBy(lessonCompletions.userId)
      .having(sql`count(*) = ${totalLessons}`);
    completed = completedRows.length;
  }

  const learnersStarted = Number(started);
  const learnersCompleted = completed;
  const completionRate = learnersStarted > 0 ? learnersCompleted / learnersStarted : 0;

  return { totalLessons, learnersStarted, learnersCompleted, completionRate };
}
