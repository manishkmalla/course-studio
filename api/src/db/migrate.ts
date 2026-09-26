import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client.js";

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
}

const isMain = process.argv[1] && process.argv[1].endsWith("migrate.ts");
if (isMain) {
  runMigrations()
    .then(() => pool.end())
    .catch((err: unknown) => {
      console.error("Migration failed", err);
      process.exit(1);
    });
}
