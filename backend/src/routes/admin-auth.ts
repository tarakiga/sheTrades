import { Router } from "express";
import { ZodError } from "zod";
import {
  changePasswordRequestSchema,
  changePasswordResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  logoutResponseSchema,
  meResponseSchema,
  updateProfileRequestSchema,
  updateProfileResponseSchema
} from "../auth/contracts.js";
import { authenticateJwt, requireAuthenticatedSession } from "../auth/jwt-rbac.js";
import { getAdminAuthService, LoginThrottledError } from "../auth/service.js";

export const adminAuthRouter = Router();
const authService = getAdminAuthService();

adminAuthRouter.post("/auth/login", async (req, res, next) => {
  try {
    const body = loginRequestSchema.parse(req.body);
    const result = await authService.login(body);
    res.status(200).json(
      loginResponseSchema.parse({
        message: "Sign-in successful.",
        session: {
          token: result.token,
          expiresAt: result.expiresAt
        },
        user: result.user
      })
    );
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        message: "Invalid admin login request payload.",
        details: error.issues
      });
      return;
    }
    if (error instanceof LoginThrottledError) {
      res.setHeader("Retry-After", String(error.retryAfterSeconds));
      res.status(429).json({
        message: error.message,
        retryAfterSeconds: error.retryAfterSeconds
      });
      return;
    }
    if (error instanceof Error) {
      res.status(401).json({ message: error.message });
      return;
    }
    next(error);
  }
});

adminAuthRouter.use("/auth", authenticateJwt, requireAuthenticatedSession);

adminAuthRouter.get("/auth/me", (req, res) => {
  res.status(200).json(
    meResponseSchema.parse({
      user: req.authUser,
      session: {
        expiresAt: req.authSession?.expiresAt
      }
    })
  );
});

adminAuthRouter.post("/auth/logout", async (req, res, next) => {
  try {
    await authService.logout(req.authSession?.id ?? "");
    res.status(200).json(logoutResponseSchema.parse({ message: "Signed out successfully." }));
  } catch (error) {
    next(error);
  }
});

adminAuthRouter.patch("/auth/profile", async (req, res, next) => {
  try {
    const body = updateProfileRequestSchema.parse(req.body);
    const user = await authService.updateProfile(req.authUser?.id ?? "", body);
    res.status(200).json(
      updateProfileResponseSchema.parse({
        message: "Profile updated successfully.",
        user
      })
    );
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        message: "Invalid profile update request payload.",
        details: error.issues
      });
      return;
    }
    next(error);
  }
});

adminAuthRouter.post("/auth/change-password", async (req, res, next) => {
  try {
    const body = changePasswordRequestSchema.parse(req.body);
    await authService.changePassword(req.authUser?.id ?? "", body);
    res
      .status(200)
      .json(changePasswordResponseSchema.parse({ message: "Password updated successfully." }));
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        message: "Invalid password change request payload.",
        details: error.issues
      });
      return;
    }
    if (error instanceof Error && /incorrect/i.test(error.message)) {
      res.status(400).json({ message: error.message });
      return;
    }
    next(error);
  }
});
