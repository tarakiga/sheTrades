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
import { authenticateJwt, requireRoles } from "../auth/jwt-rbac.js";

export const contentRouter = Router();

// GAP-A6: this legacy in-memory lesson router was mounted unauthenticated.
// Gate each route with `authenticateJwt` (and editor/admin roles for mutations).
// Auth is applied PER-ROUTE, not via router.use — this router is mounted at the
// broad "/api" path, so a router-level guard would reject unrelated /api/*
// requests (e.g. /api/reports/*) before they fall through to their own router.
const editorRole = requireRoles(["editor", "admin"]);

function handleValidationError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => issue.message);
    res.status(400).json({ message: "Invalid content payload.", details });
    return true;
  }
  return false;
}

contentRouter.get("/content/lessons", authenticateJwt, (_req, res) => {
  res.status(200).json({ lessons: listLessons() });
});

contentRouter.post("/content/lessons", authenticateJwt, editorRole, (req, res, next) => {
  try {
    const lesson = createLesson(req.body);
    res.status(201).json({ lesson });
  } catch (error) {
    if (handleValidationError(res, error)) return;
    next(error);
  }
});

contentRouter.put("/content/lessons/:id", authenticateJwt, editorRole, (req, res, next) => {
  try {
    const lesson = updateLesson(String(req.params.id), req.body);
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

contentRouter.post("/content/lessons/:id/publish", authenticateJwt, editorRole, (req, res, next) => {
  try {
    const lesson = publishLesson(String(req.params.id));
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

contentRouter.post("/content/validate", authenticateJwt, (req, res) => {
  const result = validateLesson(req.body);
  res.status(200).json(result);
});

contentRouter.get("/content/admin-view", authenticateJwt, (_req, res) => {
  res.status(200).json(listLessonsForAdmin());
});
