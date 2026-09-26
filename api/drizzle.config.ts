import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({ quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://course_studio:course_studio@localhost:5432/course_studio",
  },
});
