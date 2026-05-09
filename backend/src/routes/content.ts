import { Router } from "express";
import type { Response } from "express";
import { ZodError } from "zod";
import {
  createLesson,
  listLessons,
  listLessonsForAdmin,
  publishLesson,
  updateLesson,
  validateLesson
} from "../content/service.js";

export const contentRouter = Router();

function handleValidationError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => issue.message);
    res.status(400).json({ message: "Invalid content payload.", details });
    return true;
  }
  return false;
}

contentRouter.get("/content/lessons", (_req, res) => {
  res.status(200).json({ lessons: listLessons() });
});

contentRouter.post("/content/lessons", (req, res, next) => {
  try {
    const lesson = createLesson(req.body);
    res.status(201).json({ lesson });
  } catch (error) {
    if (handleValidationError(res, error)) return;
    next(error);
  }
});

contentRouter.put("/content/lessons/:id", (req, res, next) => {
  try {
    const lesson = updateLesson(req.params.id, req.body);
    if (!lesson) {
      res.status(404).json({ message: "Lesson not found." });
      return;
    }
    res.status(200).json({ lesson });
  } catch (error) {
    if (handleValidationError(res, error)) return;
    next(error);
  }
});

contentRouter.post("/content/lessons/:id/publish", (req, res, next) => {
  try {
    const lesson = publishLesson(req.params.id);
    if (!lesson) {
      res.status(404).json({ message: "Lesson not found." });
      return;
    }
    res.status(200).json({ lesson });
  } catch (error) {
    if (handleValidationError(res, error)) return;
    next(error);
  }
});

contentRouter.post("/content/validate", (req, res) => {
  const result = validateLesson(req.body);
  res.status(200).json(result);
});

contentRouter.get("/content/admin-view", (_req, res) => {
  res.status(200).json(listLessonsForAdmin());
});
