import { Router } from "express";
import { z } from "zod";
import { paginationQuerySchema } from "../lib/cursor.js";
import { requireRole, requireUser } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";
import { completeLesson, getLearnerCourse, listLearnerCourses } from "../services/progress.js";

export const progressRouter = Router();

progressRouter.use(requireUser, requireRole("learner"));

const idParamSchema = z.object({ id: z.uuid() });

progressRouter.get("/courses", async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");

  const query = paginationQuerySchema.parse(req.query);
  res.json(await listLearnerCourses(query, req.user.sub));
});

progressRouter.get("/courses/:id", async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");

  const { id } = idParamSchema.parse(req.params);
  res.json(await getLearnerCourse(id, req.user.sub));
});

progressRouter.post("/lessons/:id/complete", async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");

  const { id } = idParamSchema.parse(req.params);
  res.json(await completeLesson(id, req.user.sub));
});
