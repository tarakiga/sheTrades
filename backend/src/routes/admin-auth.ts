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
  updateProfileResponseSchema,
  twoFactorVerifyRequestSchema,
  twoFactorCodeRequestSchema
} from "../auth/contracts.js";
import { authenticateJwt, requireAuthenticatedSession } from "../auth/jwt-rbac.js";
import {
  getAdminAuthService,
  LoginThrottledError,
  TwoFactorRequiredError
} from "../auth/service.js";
import {
  disableTwoFactor,
  enableTwoFactor,
  getTwoFactorStatus,
  regenerateRecoveryCodes,
  setupTwoFactor,
  TwoFactorError
} from "../auth/two-factor.js";

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
    if (error instanceof TwoFactorRequiredError) {
      // The password step passed - this is a stage, not a failure. The client
      // exchanges this challenge plus a code at /auth/2fa/verify.
      res.status(200).json({
        message: "Enter the code from your authenticator app.",
        twoFactorRequired: true,
        challenge: { token: error.challengeToken, expiresAt: error.expiresAt }
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

/**
 * Step two of login. Unauthenticated by design - the caller has no session
 * yet; the challenge token is the credential, and authenticateJwt rejects it
 * everywhere else.
 */
adminAuthRouter.post("/auth/2fa/verify", async (req, res, next) => {
  try {
    const body = twoFactorVerifyRequestSchema.parse(req.body);
    const result = await authService.completeTwoFactorLogin(body);
    res.status(200).json({
      message: "Sign-in successful.",
      session: { token: result.token, expiresAt: result.expiresAt },
      user: result.user,
      usedRecoveryCode: result.usedRecoveryCode
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ message: "Invalid two-factor request.", details: error.issues });
      return;
    }
    if (error instanceof LoginThrottledError) {
      res.setHeader("Retry-After", String(error.retryAfterSeconds));
      res.status(429).json({ message: error.message, retryAfterSeconds: error.retryAfterSeconds });
      return;
    }
    if (error instanceof TwoFactorError) {
      res.status(error.status).json({ message: error.message });
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


// --- Two-factor enrolment (authenticated: an active session is required) ---

function twoFactorIssuer(): string {
  return process.env.TOTP_ISSUER?.trim() || "SheTrades";
}

function handleTwoFactorError(error: unknown, res: import("express").Response, next: import("express").NextFunction) {
  if (error instanceof ZodError) {
    res.status(400).json({ message: "Invalid two-factor request.", details: error.issues });
    return;
  }
  if (error instanceof TwoFactorError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  next(error);
}

adminAuthRouter.get("/auth/2fa/status", async (req, res, next) => {
  try {
    res.status(200).json(await getTwoFactorStatus(req.authUser!.id));
  } catch (error) {
    handleTwoFactorError(error, res, next);
  }
});

/** Phase 1: mint a secret to scan. Does NOT activate anything yet. */
adminAuthRouter.post("/auth/2fa/setup", async (req, res, next) => {
  try {
    const result = await setupTwoFactor(req.authUser!.id, twoFactorIssuer());
    res.status(200).json(result);
  } catch (error) {
    handleTwoFactorError(error, res, next);
  }
});

/** Phase 2: prove the app was scanned, then activate and issue recovery codes. */
adminAuthRouter.post("/auth/2fa/enable", async (req, res, next) => {
  try {
    const body = twoFactorCodeRequestSchema.parse(req.body);
    const result = await enableTwoFactor(req.authUser!.id, body.code);
    console.log(JSON.stringify({
      event: "auth.2fa.enabled",
      adminUserId: req.authUser!.id,
      updatedAt: new Date().toISOString()
    }));
    res.status(200).json({
      message: "Two-factor authentication is on. Save these recovery codes now - they are shown only once.",
      ...result
    });
  } catch (error) {
    handleTwoFactorError(error, res, next);
  }
});

adminAuthRouter.post("/auth/2fa/disable", async (req, res, next) => {
  try {
    const body = twoFactorCodeRequestSchema.parse(req.body);
    await disableTwoFactor(req.authUser!.id, body.code);
    console.log(JSON.stringify({
      event: "auth.2fa.disabled",
      adminUserId: req.authUser!.id,
      updatedAt: new Date().toISOString()
    }));
    res.status(200).json({ message: "Two-factor authentication is off." });
  } catch (error) {
    handleTwoFactorError(error, res, next);
  }
});

adminAuthRouter.post("/auth/2fa/recovery-codes", async (req, res, next) => {
  try {
    const recoveryCodes = await regenerateRecoveryCodes(req.authUser!.id);
    console.log(JSON.stringify({
      event: "auth.2fa.recovery_codes_regenerated",
      adminUserId: req.authUser!.id,
      updatedAt: new Date().toISOString()
    }));
    res.status(200).json({
      message: "New recovery codes issued. The previous set no longer works.",
      recoveryCodes
    });
  } catch (error) {
    handleTwoFactorError(error, res, next);
  }
});