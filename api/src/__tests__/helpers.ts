import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

export async function truncateAll(): Promise<void> {
  await db.execute(
    sql`truncate table lesson_completions, lessons, courses, users restart identity cascade`,
  );
}
