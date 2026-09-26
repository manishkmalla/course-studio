import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  WEB_ORIGIN: z.string().min(1),
});

const env = envSchema.parse(process.env);

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  databaseUrl: env.NODE_ENV === "test" ? env.TEST_DATABASE_URL : env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  webOrigin: env.WEB_ORIGIN,
};
