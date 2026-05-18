import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type {
  AdminSafeUser,
  AdminSession,
  ChangePasswordRequest,
  LoginRequest,
  UpdateProfileRequest
} from "./contracts.js";
import { adminSessionSchema, adminUserStatusSchema } from "./contracts.js";
import { getJwtConfig, signJwtHs256, type AuthRole, type JwtClaims } from "./token.js";

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

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
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

export class AdminAuthService {
  private readonly usersById = new Map<string, AdminUserRecord>();
  private readonly userIdsByEmail = new Map<string, string>();
  private readonly sessionsById = new Map<string, AdminSession>();
  private bootstrapAttempted = false;

  private upsertUser(record: AdminUserRecord) {
    this.usersById.set(record.id, record);
    this.userIdsByEmail.set(record.email, record.id);
  }

  private async ensureBootstrapped() {
    if (this.bootstrapAttempted) {
      return;
    }

    this.bootstrapAttempted = true;
    const seeds = parseBootstrapUsersFromEnv();
    for (const seed of seeds) {
      const email = normalizeEmail(seed.email);
      const existingId = this.userIdsByEmail.get(email);
      const timestamp = nowIso();
      const record: AdminUserRecord = {
        id: existingId ?? randomUUID(),
        email,
        fullName: seed.fullName.trim(),
        passwordHash: hashPassword(seed.password),
        role: seed.role ?? "admin",
        status: seed.status ?? "active",
        avatarUrl: seed.avatarUrl?.trim() ?? "",
        lastLoginAt: null,
        createdAt: existingId ? this.usersById.get(existingId)?.createdAt ?? timestamp : timestamp,
        updatedAt: timestamp
      };
      this.upsertUser(record);
    }
  }

  private getUserByIdOrThrow(userId: string) {
    const user = this.usersById.get(userId);
    if (!user) {
      throw new Error("Admin user could not be found.");
    }
    return user;
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
    const email = normalizeEmail(input.email);
    const userId = this.userIdsByEmail.get(email);
    if (!userId) {
      throw new Error("Invalid email or password.");
    }

    const user = this.getUserByIdOrThrow(userId);
    if (user.status !== "active") {
      throw new Error("This admin account is disabled.");
    }

    if (!verifyPassword(input.password, user.passwordHash)) {
      throw new Error("Invalid email or password.");
    }

    const loginAt = nowIso();
    const nextUser: AdminUserRecord = {
      ...user,
      lastLoginAt: loginAt,
      updatedAt: loginAt
    };
    this.upsertUser(nextUser);

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

    const user = this.getUserByIdOrThrow(session.adminUserId);
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
    await this.ensureBootstrapped();
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
    const user = this.getUserByIdOrThrow(userId);
    const nextUser: AdminUserRecord = {
      ...user,
      fullName: input.fullName.trim(),
      avatarUrl: input.avatarUrl.trim(),
      updatedAt: nowIso()
    };
    this.upsertUser(nextUser);
    return toSafeUser(nextUser);
  }

  async changePassword(userId: string, input: ChangePasswordRequest) {
    await this.ensureBootstrapped();
    const user = this.getUserByIdOrThrow(userId);
    if (!verifyPassword(input.currentPassword, user.passwordHash)) {
      throw new Error("Current password is incorrect.");
    }
    const nextUser: AdminUserRecord = {
      ...user,
      passwordHash: hashPassword(input.newPassword),
      updatedAt: nowIso()
    };
    this.upsertUser(nextUser);
  }

  resetForTests() {
    this.usersById.clear();
    this.userIdsByEmail.clear();
    this.sessionsById.clear();
    this.bootstrapAttempted = false;
  }
}

let singleton: AdminAuthService | null = null;

export function getAdminAuthService() {
  if (!singleton) {
    singleton = new AdminAuthService();
  }
  return singleton;
}
