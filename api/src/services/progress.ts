import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { courses, lessonCompletions, lessons } from "../db/schema.js";
import { buildPage, decodeCursor, type PaginationQuery } from "../lib/cursor.js";
import { HttpError } from "../middleware/errors.js";

type CourseRow = typeof courses.$inferSelect;
type LessonRow = typeof lessons.$inferSelect;

export interface LearnerCourseSummary extends CourseRow {
  progressPercent: number;
}

export interface LearnerLesson extends LessonRow {
  completed: boolean;
}

export interface LearnerCourseDetail extends CourseRow {
  lessons: LearnerLesson[];
  progressPercent: number;
}

function progressPercent(completed: number, total: number): number {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

export async function listLearnerCourses(
  { cursor, limit }: PaginationQuery,
  userId: string,
): Promise<{ items: LearnerCourseSummary[]; nextCursor?: string }> {
  const decoded = decodeCursor(cursor);

  const rows = await db
    .select()
    .from(courses)
    .where(
      and(
        eq(courses.status, "published"),
        decoded
          ? sql`(${courses.publishedAt}, ${courses.id}) < (${decoded.sortValue}::timestamptz, ${decoded.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(courses.publishedAt), desc(courses.id))
    .limit(limit + 1);

  const page = buildPage(rows, limit, (row) => ({
    sortValue: (row.publishedAt ?? row.createdAt).toISOString(),
    id: row.id,
  }));

  if (page.items.length === 0) {
    return { items: [], nextCursor: page.nextCursor };
  }

  const courseIds = page.items.map((course) => course.id);

  const totalsRows = await db
    .select({ courseId: lessons.courseId, total: sql<number>`count(*)` })
    .from(lessons)
    .where(inArray(lessons.courseId, courseIds))
    .groupBy(lessons.courseId);
  const totals = new Map(totalsRows.map((row) => [row.courseId, Number(row.total)]));

  const completedRows = await db
    .select({ courseId: lessons.courseId, completed: sql<number>`count(*)` })
    .from(lessonCompletions)
    .innerJoin(lessons, eq(lessons.id, lessonCompletions.lessonId))
    .where(and(eq(lessonCompletions.userId, userId), inArray(lessons.courseId, courseIds)))
    .groupBy(lessons.courseId);
  const completedByCourse = new Map(completedRows.map((row) => [row.courseId, Number(row.completed)]));

  const items = page.items.map((course) => ({
    ...course,
    progressPercent: progressPercent(completedByCourse.get(course.id) ?? 0, totals.get(course.id) ?? 0),
  }));

  return { items, nextCursor: page.nextCursor };
}

export async function getLearnerCourse(
  courseId: string,
  userId: string,
): Promise<LearnerCourseDetail> {
  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.status, "published")))
    .limit(1);

  // A draft and a missing course look identical here on purpose — learners
  // must never be able to tell a draft exists.
  if (!course) throw new HttpError(404, "Course not found");

  const lessonRows = await db
    .select()
    .from(lessons)
    .where(eq(lessons.courseId, courseId))
    .orderBy(lessons.position);

  const completedIds =
    lessonRows.length > 0
      ? new Set(
          (
            await db
              .select({ lessonId: lessonCompletions.lessonId })
              .from(lessonCompletions)
              .where(
                and(
                  eq(lessonCompletions.userId, userId),
                  inArray(
                    lessonCompletions.lessonId,
                    lessonRows.map((lesson) => lesson.id),
                  ),
                ),
              )
          ).map((row) => row.lessonId),
        )
      : new Set<string>();

  const lessonsWithCompletion = lessonRows.map((lesson) => ({
    ...lesson,
    completed: completedIds.has(lesson.id),
  }));

  return {
    ...course,
    lessons: lessonsWithCompletion,
    progressPercent: progressPercent(completedIds.size, lessonRows.length),
  };
}

export async function completeLesson(lessonId: string, userId: string): Promise<{ completed: true }> {
  const [lesson] = await db
    .select({ id: lessons.id, courseId: lessons.courseId })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (!lesson) throw new HttpError(404, "Lesson not found");

  const [course] = await db
    .select({ status: courses.status })
    .from(courses)
    .where(eq(courses.id, lesson.courseId))
    .limit(1);
  if (!course || course.status !== "published") throw new HttpError(404, "Lesson not found");

  await db.insert(lessonCompletions).values({ userId, lessonId }).onConflictDoNothing();

  return { completed: true };
}
