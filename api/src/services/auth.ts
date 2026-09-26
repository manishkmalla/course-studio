import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { isUniqueViolation } from "../lib/dbErrors.js";
import { HttpError } from "../middleware/errors.js";

export interface AuthUser {
  id: string;
  email: string;
  role: "creator" | "learner";
}

const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";

// Precomputed hash of an unguessable value, compared against on every failed
// lookup so that login takes roughly the same time whether or not the email
// exists. Without this, an attacker could tell registered emails apart from
// unregistered ones just by measuring response time (a real bcrypt compare
// is much slower than an early return).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function register(email: string, password: string): Promise<AuthUser> {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const [user] = await db
      .insert(users)
      .values({ email: normalizedEmail, passwordHash, role: "learner" })
      .returning({ id: users.id, email: users.email, role: users.role });

    if (!user) throw new Error("Insert returned no row");
    return user;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new HttpError(409, "Email already registered");
    }
    throw err;
  }
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const normalizedEmail = email.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

  const passwordMatches = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !passwordMatches) {
    throw new HttpError(401, INVALID_CREDENTIALS_MESSAGE);
  }

  return { id: user.id, email: user.email, role: user.role };
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: "1d",
  });
}

export async function getById(id: string): Promise<AuthUser | null> {
  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return user ?? null;
}
