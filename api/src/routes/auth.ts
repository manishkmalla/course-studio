import type { CookieOptions } from "express";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { HttpError } from "../middleware/errors.js";
import { requireUser } from "../middleware/auth.js";
import { getById, login, register, signToken } from "../services/auth.js";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: config.nodeEnv === "production",
};

authRouter.post("/register", async (req, res) => {
  const { email, password } = credentialsSchema.parse(req.body);
  const user = await register(email, password);
  res.status(201).json(user);
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = credentialsSchema.parse(req.body);
  const user = await login(email, password);
  const token = signToken(user);
  res.cookie("token", token, { ...cookieOptions, maxAge: 24 * 60 * 60 * 1000 });
  res.json(user);
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("token", cookieOptions);
  res.status(204).end();
});

authRouter.get("/me", requireUser, async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");

  // req.user only carries the token's minimal payload (sub, role); look up
  // the full record for email.
  const user = await getById(req.user.sub);
  if (!user) throw new HttpError(401, "Not authenticated");

  res.json(user);
});
