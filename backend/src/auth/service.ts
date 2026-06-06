import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type {
  AdminManagedUser,
  AdminSafeUser,
  AdminSession,
  ChangePasswordRequest,
  LoginRequest,
  UpdateProfileRequest
} from "./contracts.js";
import { adminSessionSchema, adminUserStatusSchema } from "./contracts.js";
import { getJwtConfig, signJwtHs256, type AuthRole, type JwtClaims } from "./token.js";
import { prisma } from "../admin/prisma.js";

type AdminUserRecord = {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: AuthRole;
  status: "active" | "disabled";
  avatarUrl: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type SessionContext = {
  user: AdminSafeUser;
  session: AdminSession;
};

type BootstrapUserInput = {
  email: string;
  password: string;
  fullName: string;
  role?: AuthRole;
  avatarUrl?: string;
  status?: "active" | "disabled";
};

// The Prisma row shape for an admin_accounts record (kept local so this module
// does not depend on generated type names beyond the client surface).
type AdminAccountRow = {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: string;
  status: string;
  avatarUrl: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function toRole(value: string): AuthRole {
  return value === "admin" || value === "editor" || value === "viewer" ? value : "viewer";
}

function toStatus(value: string): "active" | "disabled" {
  return value === "disabled" ? "disabled" : "active";
}

function accountRowToRecord(row: AdminAccountRow): AdminUserRecord {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    passwordHash: row.passwordHash,
    role: toRole(row.role),
    status: toStatus(row.status),
    avatarUrl: row.avatarUrl ?? "",
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string) {
  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    throw new Error("Unsupported password hash format.");
  }

  const salt = parts[1];
  const expectedHex = parts[2];
  if (!salt || !expectedHex) {
    throw new Error("Stored password hash is invalid.");
  }

  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function getSessionTtlSeconds() {
  const raw = process.env.ADMIN_AUTH_SESSION_TTL_SECONDS;
  const parsed = raw ? Number(raw) : 60 * 60 * 12;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60 * 60 * 12;
  }
  return Math.floor(parsed);
}

function parseBootstrapUsersFromEnv(): BootstrapUserInput[] {
  const jsonRaw = process.env.ADMIN_AUTH_BOOTSTRAP_USERS_JSON?.trim();
  if (jsonRaw) {
    const parsed = JSON.parse(jsonRaw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("ADMIN_AUTH_BOOTSTRAP_USERS_JSON must be a JSON array.");
    }
    return parsed.map((item, index) => {
      if (!item || typeof item !== "object") {
        throw new Error(`Bootstrap admin at index ${index} is invalid.`);
      }

      const candidate = item as Record<string, unknown>;
      return {
        email: String(candidate.email ?? ""),
        password: String(candidate.password ?? ""),
        fullName: String(candidate.fullName ?? ""),
        role:
          candidate.role === "admin" || candidate.role === "editor" || candidate.role === "viewer"
            ? candidate.role
            : "admin",
        avatarUrl: typeof candidate.avatarUrl === "string" ? candidate.avatarUrl : "",
        status: candidate.status === "disabled" ? "disabled" : "active"
      };
    });
  }

  const email = process.env.ADMIN_AUTH_BOOTSTRAP_EMAIL?.trim() ?? "";
  const password = process.env.ADMIN_AUTH_BOOTSTRAP_PASSWORD?.trim() ?? "";
  const fullName = process.env.ADMIN_AUTH_BOOTSTRAP_FULL_NAME?.trim() ?? "";
  if (!email || !password || !fullName) {
    return [];
  }

  const roleEnv = process.env.ADMIN_AUTH_BOOTSTRAP_ROLE;
  const statusEnv = process.env.ADMIN_AUTH_BOOTSTRAP_STATUS;
  const role: AuthRole =
    roleEnv === "admin" || roleEnv === "editor" || roleEnv === "viewer" ? roleEnv : "admin";
  const status =
    adminUserStatusSchema.safeParse(statusEnv).success && statusEnv === "disabled"
      ? "disabled"
      : "active";

  return [
    {
      email,
      password,
      fullName,
      role,
      avatarUrl: process.env.ADMIN_AUTH_BOOTSTRAP_AVATAR_URL?.trim() ?? "",
      status
    }
  ];
}

function toSafeUser(record: AdminUserRecord): AdminSafeUser {
  return {
    id: record.id,
    fullName: record.fullName,
    email: record.email,
    role: record.role,
    avatarUrl: record.avatarUrl,
    status: record.status,
    lastLoginAt: record.lastLoginAt
  };
}

// The seed admin(s) defined via env (ADMIN_AUTH_BOOTSTRAP_*) are "protected":
// they are the platform's root operator accounts and cannot be deleted, so the
// dashboard can never lock itself out of admin management.
function getProtectedAdminEmails(): Set<string> {
  return new Set(parseBootstrapUsersFromEnv().map((seed) => normalizeEmail(seed.email)));
}

function isProtectedAdminEmail(email: string): boolean {
  return getProtectedAdminEmails().has(normalizeEmail(email));
}

function toManagedUser(record: AdminUserRecord): AdminManagedUser {
  return {
    ...toSafeUser(record),
    createdAt: record.createdAt,
    protected: isProtectedAdminEmail(record.email)
  };
}

/**
 * Admin accounts are persisted in Postgres (admin_accounts) so they survive
 * Cloud Run restarts and are consistent across instances. Sessions remain an
 * in-memory map for now (a session minted on one instance is not yet shared
 * with another — tracked as GAP-D1); because every authenticated request
 * re-loads the account from the DB and checks status, suspending an admin
 * takes effect immediately regardless.
 */
export class AdminAuthService {
  private readonly sessionsById = new Map<string, AdminSession>();
  private bootstrapAttempted = false;

  private async ensureBootstrapped() {
    if (this.bootstrapAttempted) {
      return;
    }
    this.bootstrapAttempted = true;

    const seeds = parseBootstrapUsersFromEnv();
    for (const seed of seeds) {
      const email = normalizeEmail(seed.email);
      // Create-only: never overwrite an existing account (an admin may have
      // changed their password or role after the initial seed).
      await prisma.adminAccount.upsert({
        where: { email },
        update: {},
        create: {
          email,
          fullName: seed.fullName.trim(),
          passwordHash: hashPassword(seed.password),
          role: seed.role ?? "admin",
          status: seed.status ?? "active",
          avatarUrl: seed.avatarUrl?.trim() ?? ""
        }
      });
    }
  }

  private async findRecordByEmail(email: string): Promise<AdminUserRecord | null> {
    const row = await prisma.adminAccount.findUnique({ where: { email: normalizeEmail(email) } });
    return row ? accountRowToRecord(row as AdminAccountRow) : null;
  }

  private async getRecordByIdOrThrow(userId: string): Promise<AdminUserRecord> {
    const row = await prisma.adminAccount.findUnique({ where: { id: userId } });
    if (!row) {
      throw new Error("Admin user could not be found.");
    }
    return accountRowToRecord(row as AdminAccountRow);
  }

  private countActiveAdmins(): Promise<number> {
    return prisma.adminAccount.count({ where: { role: "admin", status: "active" } });
  }

  private revokeSessionsForUser(userId: string) {
    for (const session of this.sessionsById.values()) {
      if (session.adminUserId === userId && !session.revokedAt) {
        this.sessionsById.set(session.id, { ...session, revokedAt: nowIso() });
      }
    }
  }

  private createSessionForUser(user: AdminUserRecord) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = issuedAt + getSessionTtlSeconds();
    const sessionId = randomUUID();
    const tokenId = randomUUID();
    const config = getJwtConfig();
    const claims: JwtClaims = {
      sub: user.id,
      role: user.role,
      sid: sessionId,
      typ: "admin_session",
      iat: issuedAt,
      exp: expiresAtSeconds,
      ...(config.issuer ? { iss: config.issuer } : {}),
      ...(config.audience ? { aud: config.audience } : {})
    };

    const token = signJwtHs256(claims, config.secret);
    const session: AdminSession = adminSessionSchema.parse({
      id: sessionId,
      adminUserId: user.id,
      tokenId,
      expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
      revokedAt: null,
      lastSeenAt: null,
      createdAt: nowIso()
    });

    this.sessionsById.set(session.id, session);
    return { token, session };
  }

  async login(input: LoginRequest) {
    await this.ensureBootstrapped();
    const user = await this.findRecordByEmail(input.email);
    if (!user) {
      throw new Error("Invalid email or password.");
    }
    if (user.status !== "active") {
      throw new Error("This admin account is disabled.");
    }
    if (!verifyPassword(input.password, user.passwordHash)) {
      throw new Error("Invalid email or password.");
    }

    const loginAt = new Date();
    await prisma.adminAccount.update({
      where: { id: user.id },
      data: { lastLoginAt: loginAt }
    });
    const nextUser: AdminUserRecord = {
      ...user,
      lastLoginAt: loginAt.toISOString(),
      updatedAt: loginAt.toISOString()
    };

    const { token, session } = this.createSessionForUser(nextUser);
    return {
      token,
      expiresAt: session.expiresAt,
      user: toSafeUser(nextUser)
    };
  }

  async getSessionContextFromClaims(claims: JwtClaims): Promise<SessionContext | null> {
    await this.ensureBootstrapped();
    if (!claims.sid) {
      return null;
    }

    const session = this.sessionsById.get(claims.sid);
    if (!session) {
      throw new Error("Session could not be found.");
    }
    if (session.revokedAt) {
      throw new Error("Session has been revoked.");
    }
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      throw new Error("Session is expired.");
    }

    const user = await this.getRecordByIdOrThrow(session.adminUserId);
    if (user.status !== "active") {
      throw new Error("This admin account is disabled.");
    }

    const updatedSession: AdminSession = {
      ...session,
      lastSeenAt: nowIso()
    };
    this.sessionsById.set(updatedSession.id, updatedSession);

    return {
      user: toSafeUser(user),
      session: updatedSession
    };
  }

  async logout(sessionId: string) {
    const session = this.sessionsById.get(sessionId);
    if (!session) {
      throw new Error("Session could not be found.");
    }
    this.sessionsById.set(session.id, {
      ...session,
      revokedAt: nowIso()
    });
  }

  async updateProfile(userId: string, input: UpdateProfileRequest) {
    await this.ensureBootstrapped();
    const row = await prisma.adminAccount.update({
      where: { id: userId },
      data: { fullName: input.fullName.trim(), avatarUrl: input.avatarUrl.trim() }
    });
    return toSafeUser(accountRowToRecord(row as AdminAccountRow));
  }

  async changePassword(userId: string, input: ChangePasswordRequest) {
    await this.ensureBootstrapped();
    const user = await this.getRecordByIdOrThrow(userId);
    if (!verifyPassword(input.currentPassword, user.passwordHash)) {
      throw new Error("Current password is incorrect.");
    }
    await prisma.adminAccount.update({
      where: { id: userId },
      data: { passwordHash: hashPassword(input.newPassword) }
    });
  }

  // ---------------------------------------------------------------------------
  // Admin team management (gated to role "admin" at the route layer)
  // ---------------------------------------------------------------------------

  async listAccounts(): Promise<AdminManagedUser[]> {
    await this.ensureBootstrapped();
    const rows = await prisma.adminAccount.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map((row) => toManagedUser(accountRowToRecord(row as AdminAccountRow)));
  }

  async createAccount(
    input: { email: string; fullName: string; role: AuthRole; password: string },
    createdById: string | null
  ): Promise<AdminManagedUser> {
    await this.ensureBootstrapped();
    const email = normalizeEmail(input.email);
    const existing = await prisma.adminAccount.findUnique({ where: { email } });
    if (existing) {
      throw new Error("An admin with this email already exists.");
    }
    const row = await prisma.adminAccount.create({
      data: {
        email,
        fullName: input.fullName.trim(),
        passwordHash: hashPassword(input.password),
        role: input.role,
        status: "active",
        avatarUrl: "",
        createdBy: createdById
      }
    });
    return toManagedUser(accountRowToRecord(row as AdminAccountRow));
  }

  async updateRole(
    targetId: string,
    role: AuthRole,
    actorId: string
  ): Promise<AdminManagedUser> {
    await this.ensureBootstrapped();
    const target = await this.getRecordByIdOrThrow(targetId);
    if (actorId === targetId && role !== "admin") {
      throw new Error("You cannot change your own role.");
    }
    if (target.role === "admin" && role !== "admin" && target.status === "active") {
      const activeAdmins = await this.countActiveAdmins();
      if (activeAdmins <= 1) {
        throw new Error("At least one active admin must remain.");
      }
    }
    const row = await prisma.adminAccount.update({ where: { id: targetId }, data: { role } });
    return toManagedUser(accountRowToRecord(row as AdminAccountRow));
  }

  async setStatus(
    targetId: string,
    status: "active" | "disabled",
    actorId: string
  ): Promise<AdminManagedUser> {
    await this.ensureBootstrapped();
    const target = await this.getRecordByIdOrThrow(targetId);
    if (status === "disabled") {
      if (actorId === targetId) {
        throw new Error("You cannot suspend your own account.");
      }
      if (target.role === "admin" && target.status === "active") {
        const activeAdmins = await this.countActiveAdmins();
        if (activeAdmins <= 1) {
          throw new Error("At least one active admin must remain.");
        }
      }
    }
    const row = await prisma.adminAccount.update({ where: { id: targetId }, data: { status } });
    if (status === "disabled") {
      this.revokeSessionsForUser(targetId);
    }
    return toManagedUser(accountRowToRecord(row as AdminAccountRow));
  }

  async resetPassword(targetId: string, newPassword: string): Promise<void> {
    await this.ensureBootstrapped();
    await this.getRecordByIdOrThrow(targetId);
    await prisma.adminAccount.update({
      where: { id: targetId },
      data: { passwordHash: hashPassword(newPassword) }
    });
  }

  async deleteAccount(targetId: string, actorId: string): Promise<void> {
    await this.ensureBootstrapped();
    const target = await this.getRecordByIdOrThrow(targetId);
    if (isProtectedAdminEmail(target.email)) {
      throw new Error("This is a protected admin account and cannot be deleted.");
    }
    if (actorId === targetId) {
      throw new Error("You cannot delete your own account.");
    }
    if (target.role === "admin" && target.status === "active") {
      const activeAdmins = await this.countActiveAdmins();
      if (activeAdmins <= 1) {
        throw new Error("At least one active admin must remain.");
      }
    }
    await prisma.adminAccount.delete({ where: { id: targetId } });
    this.revokeSessionsForUser(targetId);
  }

  async resetForTests() {
    this.sessionsById.clear();
    this.bootstrapAttempted = false;
    try {
      await prisma.adminAccount.deleteMany({});
    } catch {
      // Best-effort: tests that do not provision Postgres can ignore this.
    }
  }
}

let singleton: AdminAuthService | null = null;

export function getAdminAuthService() {
  if (!singleton) {
    singleton = new AdminAuthService();
  }
  return singleton;
}
