import { z } from "zod";
import { roleSchema } from "./token.js";

export const adminUserStatusSchema = z.enum(["active", "disabled"]);
export type AdminUserStatus = z.infer<typeof adminUserStatusSchema>;

export const adminSafeUserSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(1),
  email: z.string().email(),
  role: roleSchema,
  avatarUrl: z.string().optional().default(""),
  status: adminUserStatusSchema,
  lastLoginAt: z.string().datetime().nullable()
});
export type AdminSafeUser = z.infer<typeof adminSafeUserSchema>;

// Admin team-management (managing other admin accounts)
export const adminManagedUserSchema = adminSafeUserSchema.extend({
  createdAt: z.string().datetime()
});
export type AdminManagedUser = z.infer<typeof adminManagedUserSchema>;

export const createAdminRequestSchema = z.object({
  email: z.string().trim().email(),
  fullName: z.string().trim().min(1).max(120),
  role: roleSchema,
  password: z.string().min(10).max(200)
});
export type CreateAdminRequest = z.infer<typeof createAdminRequestSchema>;

export const updateAdminRoleRequestSchema = z.object({ role: roleSchema });
export type UpdateAdminRoleRequest = z.infer<typeof updateAdminRoleRequestSchema>;

export const resetAdminPasswordRequestSchema = z.object({
  password: z.string().min(10).max(200)
});
export type ResetAdminPasswordRequest = z.infer<typeof resetAdminPasswordRequestSchema>;

export const adminSessionSchema = z.object({
  id: z.string().min(1),
  adminUserId: z.string().min(1),
  tokenId: z.string().min(1),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  lastSeenAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type AdminSession = z.infer<typeof adminSessionSchema>;

export const adminSessionPayloadSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime()
});
export type AdminSessionPayload = z.infer<typeof adminSessionPayloadSchema>;

export const loginRequestSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(200)
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginResponseSchema = z.object({
  message: z.string().min(1),
  session: adminSessionPayloadSchema,
  user: adminSafeUserSchema
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const logoutResponseSchema = z.object({
  message: z.string().min(1)
});
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

export const meResponseSchema = z.object({
  user: adminSafeUserSchema,
  session: z.object({
    expiresAt: z.string().datetime()
  })
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const updateProfileRequestSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  avatarUrl: z.string().trim().max(500).optional().default("")
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export const updateProfileResponseSchema = z.object({
  message: z.string().min(1),
  user: adminSafeUserSchema
});
export type UpdateProfileResponse = z.infer<typeof updateProfileResponseSchema>;

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(8).max(200),
    newPassword: z.string().min(10).max(200)
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "New password must be different from the current password.",
    path: ["newPassword"]
  });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const changePasswordResponseSchema = z.object({
  message: z.string().min(1)
});
export type ChangePasswordResponse = z.infer<typeof changePasswordResponseSchema>;

export const adminAuthErrorResponseSchema = z.object({
  message: z.string().min(1)
});
export type AdminAuthErrorResponse = z.infer<typeof adminAuthErrorResponseSchema>;
