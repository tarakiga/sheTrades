import { Router } from "express";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  authorizeReportsAccess,
  getReportExportById,
  listReportExports,
  listReportSchemas,
  requestReportExport
} from "../reports/export-service.js";

export const reportsRouter = Router();

function ensureAccess(req: Request, res: Response) {
  const auth = authorizeReportsAccess(req.headers);
  if (!auth.ok) {
    res.status(403).json({ message: auth.message });
    return false;
  }
  return true;
}

reportsRouter.get("/reports/schemas", (req, res) => {
  if (!ensureAccess(req, res)) return;
  res.status(200).json({ schemas: listReportSchemas() });
});

reportsRouter.get("/reports/exports", (req, res) => {
  if (!ensureAccess(req, res)) return;
  res.status(200).json({ exports: listReportExports() });
});

reportsRouter.get("/reports/exports/:id", (req, res) => {
  if (!ensureAccess(req, res)) return;
  const job = getReportExportById(req.params.id);
  if (!job) {
    res.status(404).json({ message: "Export job not found." });
    return;
  }
  res.status(200).json({ job });
});

reportsRouter.post("/reports/exports", async (req, res, next) => {
  if (!ensureAccess(req, res)) return;
  try {
    const result = await requestReportExport(req.body);
    if (result.status === "failed") {
      res.status(502).json(result);
      return;
    }
    res.status(result.status === "created" ? 201 : 200).json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        message: "Invalid report export payload.",
        details: error.issues.map((issue) => issue.message)
      });
      return;
    }
    if (error instanceof Error && error.message.includes("Schema mismatch")) {
      res.status(409).json({ message: error.message });
      return;
    }
    next(error);
  }
});
