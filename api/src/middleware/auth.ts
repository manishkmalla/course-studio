import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { HttpError } from "./errors.js";

export interface AuthTokenPayload {
  sub: string;
  role: "creator" | "learner";
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

function isAuthTokenPayload(payload: unknown): payload is AuthTokenPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const { sub, role } = payload as Record<string, unknown>;
  return typeof sub === "string" && (role === "creator" || role === "learner");
}

export function requireUser(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.token as string | undefined;
  if (!token) {
    next(new HttpError(401, "Not authenticated"));
    return;
  }

  let payload: unknown;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    next(new HttpError(401, "Not authenticated"));
    return;
  }

  if (!isAuthTokenPayload(payload)) {
    next(new HttpError(401, "Not authenticated"));
    return;
  }

  req.user = payload;
  next();
}

export function requireRole(role: AuthTokenPayload["role"]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new HttpError(401, "Not authenticated"));
      return;
    }
    if (req.user.role !== role) {
      next(new HttpError(403, "Forbidden"));
      return;
    }
    next();
  };
}
