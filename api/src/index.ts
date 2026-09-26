import { app } from "./app.js";
import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { seedIfEmpty } from "./db/seed.js";

async function main(): Promise<void> {
  await runMigrations();
  await seedIfEmpty();

  app.listen(config.port, () => {
    console.log(`api listening on port ${config.port}`);
  });
}

main().catch((err: unknown) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
