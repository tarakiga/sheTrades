import { Router } from "express";
import type { NextFunction, Response } from "express";
import { ZodError } from "zod";
import { authenticateJwt, requireRoles } from "../auth/jwt-rbac.js";
import { getAdminAuthService } from "../auth/service.js";
import {
  createAdminRequestSchema,
  resetAdminPasswordRequestSchema,
  updateAdminRoleRequestSchema
} from "../auth/contracts.js";
import { sendAdminInviteEmail } from "../notifications/admin-invite-email.js";

/**
 * Admin team management — create admins, change roles, suspend/reactivate,
 * reset passwords. Mounted at /api/admin/team and gated to role "admin".
 * Distinct from /api/admin/users (the LEARNER directory).
 */
export const adminTeamRouter = Router();
const authService = getAdminAuthService();

adminTeamRouter.use(authenticateJwt);
adminTeamRouter.use(requireRoles(["admin"]));

function logAction(actorId: string, action: string, targetId: string, extra?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      event: "admin_team.action",
      action,
      actorId: actorId || null,
      targetId,
      updatedAt: new Date().toISOString(),
      ...(extra ?? {})
    })
  );
}

// Map known business/validation errors to 4xx; defer the rest to the handler.
function respondError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof ZodError) {
    res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request payload." });
    return;
  }
  if (error instanceof Error) {
    if (/could not be found/i.test(error.message)) {
      res.status(404).json({ message: error.message });
      return;
    }
    if (/already exists/i.test(error.message)) {
      res.status(409).json({ message: error.message });
      return;
    }
    if (/must remain|your own|cannot be deleted/i.test(error.message)) {
      res.status(400).json({ message: error.message });
      return;
    }
  }
  next(error);
}

adminTeamRouter.get("/", async (_req, res, next) => {
  try {
    const admins = await authService.listAccounts();
    res.status(200).json({ admins });
  } catch (error) {
    next(error);
  }
});

adminTeamRouter.post("/", async (req, res, next) => {
  try {
    const body = createAdminRequestSchema.parse(req.body);
    const actorId = req.authUser?.id ?? null;
    const admin = await authService.createAccount(body, actorId);
    logAction(actorId ?? "", "create", admin.id, { role: admin.role, email: admin.email });

    // Notify the new member that they have an account and should log in.
    // Best-effort: the account already exists, so a mail failure (or no SMTP
    // configured) must not turn a successful creation into an error.
    const invite = await sendAdminInviteEmail({
      fullName: body.fullName,
      email: body.email,
      role: admin.role,
      invitedByName: null
    });
    if (invite.status === "sent") {
      logAction(actorId ?? "", "invite_email_sent", admin.id);
    } else {
      console.log(
        JSON.stringify({
          event: "admin_team.invite_email",
          status: invite.status,
          reason: invite.reason,
          targetId: admin.id,
          updatedAt: new Date().toISOString()
        })
      );
    }

    res.status(201).json({ message: "Admin account created.", admin, invite });
  } catch (error) {
    respondError(error, res, next);
  }
});

adminTeamRouter.patch("/:id/role", async (req, res, next) => {
  try {
    const body = updateAdminRoleRequestSchema.parse(req.body);
    const actorId = req.authUser?.id ?? "";
    const admin = await authService.updateRole(String(req.params.id), body.role, actorId);
    logAction(actorId, "update_role", admin.id, { role: admin.role });
    res.status(200).json({ message: "Role updated.", admin });
  } catch (error) {
    respondError(error, res, next);
  }
});

adminTeamRouter.post("/:id/suspend", async (req, res, next) => {
  try {
    const actorId = req.authUser?.id ?? "";
    const admin = await authService.setStatus(String(req.params.id), "disabled", actorId);
    logAction(actorId, "suspend", admin.id);
    res.status(200).json({ message: "Admin suspended.", admin });
  } catch (error) {
    respondError(error, res, next);
  }
});

adminTeamRouter.post("/:id/reactivate", async (req, res, next) => {
  try {
    const actorId = req.authUser?.id ?? "";
    const admin = await authService.setStatus(String(req.params.id), "active", actorId);
    logAction(actorId, "reactivate", admin.id);
    res.status(200).json({ message: "Admin reactivated.", admin });
  } catch (error) {
    respondError(error, res, next);
  }
});

adminTeamRouter.post("/:id/reset-password", async (req, res, next) => {
  try {
    const body = resetAdminPasswordRequestSchema.parse(req.body);
    const actorId = req.authUser?.id ?? "";
    await authService.resetPassword(String(req.params.id), body.password);
    logAction(actorId, "reset_password", String(req.params.id));
    res.status(200).json({ message: "Temporary password set." });
  } catch (error) {
    respondError(error, res, next);
  }
});

adminTeamRouter.delete("/:id", async (req, res, next) => {
  try {
    const actorId = req.authUser?.id ?? "";
    await authService.deleteAccount(String(req.params.id), actorId);
    logAction(actorId, "delete", String(req.params.id));
    res.status(200).json({ message: "Admin account deleted." });
  } catch (error) {
    respondError(error, res, next);
  }
});
