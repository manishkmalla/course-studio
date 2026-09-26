import { Router } from "express";
import { z } from "zod";
import { paginationQuerySchema } from "../lib/cursor.js";
import { requireRole, requireUser } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";
import {
  createCourse,
  getCourse,
  getCourseStats,
  listCourses,
  publishCourse,
  saveCourse,
} from "../services/courses.js";

export const coursesRouter = Router();

coursesRouter.use(requireUser, requireRole("creator"));

const idParamSchema = z.object({ id: z.uuid() });

const createCourseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
});

const lessonInputSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
});

const saveCourseSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().min(1),
    version: z.int().positive(),
    lessons: z.array(lessonInputSchema),
  })
  .refine(
    (data) => {
      const ids = data.lessons.map((lesson) => lesson.id).filter((id): id is string => id !== undefined);
      return ids.length === new Set(ids).size;
    },
    { message: "Duplicate lesson id in request" },
  );

const publishSchema = z.object({ version: z.int().positive() });

coursesRouter.get("/", async (req, res) => {
  const query = paginationQuerySchema.parse(req.query);
  res.json(await listCourses(query));
});

coursesRouter.post("/", async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");

  const body = createCourseSchema.parse(req.body);
  const course = await createCourse(body.title, body.description, req.user.sub);
  res.status(201).json(course);
});

coursesRouter.get("/:id", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await getCourse(id));
});

coursesRouter.put("/:id", async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");

  const { id } = idParamSchema.parse(req.params);
  const body = saveCourseSchema.parse(req.body);
  const course = await saveCourse(id, body.version, body, req.user.sub);
  res.json(course);
});

coursesRouter.post("/:id/publish", async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");

  const { id } = idParamSchema.parse(req.params);
  const body = publishSchema.parse(req.body);
  const course = await publishCourse(id, body.version, req.user.sub);
  res.json(course);
});

coursesRouter.get("/:id/stats", async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await getCourseStats(id));
});
