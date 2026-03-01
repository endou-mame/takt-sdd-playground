import { hash, compare } from "bcryptjs";
import type { EventStore } from "../../../infrastructure/event-store/EventStore";
import type { UserRepository } from "../../../infrastructure/repository/DrizzleUserRepository";
import type { EmailService } from "../../../infrastructure/email/EmailService";
import { createUser, isLocked, recordLoginFailure, type User } from "../../../domain/user/User";
import type { UserEvent } from "../../../domain/user/UserEvents";
import { parseEmail, type Email, type UserId } from "../../../domain/shared/ValueObjects";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  invalidateRefreshToken,
} from "../../../infrastructure/auth/JwtService";
import { loadCurrentVersion } from "./userCommandUtils";

const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const BCRYPT_COST = 12;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type AuthContext = {
  readonly db: D1Database;
  readonly userRepository: UserRepository;
  readonly eventStore: EventStore;
  readonly emailService: EmailService;
  readonly jwtSecret: string;
  readonly appBaseUrl: string;
};

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

export type RegisterCommand = {
  readonly email: string;
  readonly password: string;
  readonly name: string;
};

export type LoginCommand = {
  readonly email: string;
  readonly password: string;
};

export type RefreshTokenCommand = {
  readonly refreshToken: string;
};

// ---------------------------------------------------------------------------
// handleRegister
// ---------------------------------------------------------------------------

export async function handleRegister(
  cmd: RegisterCommand,
  ctx: AuthContext,
): Promise<{ userId: string }> {
  let email: Email;
  try {
    email = parseEmail(cmd.email);
  } catch {
    throw { code: "INVALID_EMAIL" as const };
  }

  if (cmd.password.length < 8) {
    throw { code: "INVALID_PASSWORD" as const };
  }

  const existing = await ctx.userRepository.findByEmail(email);
  if (existing) {
    throw { code: "DUPLICATE_EMAIL" as const };
  }

  const passwordHash = await hash(cmd.password, BCRYPT_COST);
  const userId = crypto.randomUUID() as UserId;
  const now = new Date().toISOString();

  const user = createUser({ id: userId, email, passwordHash, name: cmd.name, role: "CUSTOMER" });

  await ctx.userRepository.save({
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
    failedLoginAttempts: user.failedLoginAttempts,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
  });

  const registeredEvent: UserEvent = {
    type: "UserRegistered",
    userId: user.id,
    email: user.email,
    name: user.name,
  };
  await ctx.eventStore.append(
    user.id,
    "user",
    [{ type: registeredEvent.type, payload: registeredEvent }],
    0,
  );

  const verificationToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS).toISOString();
  await ctx.db
    .prepare(
      "INSERT INTO email_verification_tokens (token, user_id, expires_at, used) VALUES (?, ?, ?, 0)",
    )
    .bind(verificationToken, user.id, expiresAt)
    .run();

  const verificationLink = `${ctx.appBaseUrl}/auth/verify-email?token=${verificationToken}`;
  await ctx.emailService.sendEmailVerification({ to: user.email, verificationLink });

  return { userId: user.id };
}

// ---------------------------------------------------------------------------
// handleLogin
// ---------------------------------------------------------------------------

export async function handleLogin(
  cmd: LoginCommand,
  ctx: AuthContext,
): Promise<{ accessToken: string; refreshToken: string }> {
  const record = await ctx.userRepository.findByEmail(cmd.email);
  if (!record) {
    throw { code: "INVALID_CREDENTIALS" as const };
  }

  const userState: User = toUser(record);
  if (isLocked(userState)) {
    throw { code: "ACCOUNT_LOCKED" as const };
  }

  const passwordValid = await compare(cmd.password, record.passwordHash);
  if (!passwordValid) {
    await handleLoginFailure(userState, ctx);
    throw { code: "INVALID_CREDENTIALS" as const };
  }

  const now = new Date().toISOString();
  if (record.failedLoginAttempts > 0) {
    await ctx.userRepository.update(record.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
    });
    const currentVersion = await loadCurrentVersion(record.id, ctx.eventStore);
    const unlockedEvent: UserEvent = { type: "AccountUnlocked", userId: record.id };
    await ctx.eventStore.append(
      record.id,
      "user",
      [{ type: unlockedEvent.type, payload: unlockedEvent }],
      currentVersion,
    );
  }

  const accessToken = await generateAccessToken(
    record.id as UserId,
    record.role as "CUSTOMER" | "ADMIN",
    ctx.jwtSecret,
  );
  const refreshToken = await generateRefreshToken(record.id as UserId, ctx.db);

  return { accessToken, refreshToken };
}

// ---------------------------------------------------------------------------
// handleLogout
// ---------------------------------------------------------------------------

export async function handleLogout(
  token: string,
  ctx: Pick<AuthContext, "db">,
): Promise<void> {
  await invalidateRefreshToken(token, ctx.db);
}

// ---------------------------------------------------------------------------
// handleRefreshToken
// ---------------------------------------------------------------------------

export async function handleRefreshToken(
  cmd: RefreshTokenCommand,
  ctx: Pick<AuthContext, "db" | "userRepository" | "jwtSecret">,
): Promise<{ accessToken: string }> {
  const userId = await verifyRefreshToken(cmd.refreshToken, ctx.db);

  const record = await ctx.userRepository.findById(userId);
  if (!record) {
    throw { code: "INVALID_REFRESH_TOKEN" as const };
  }

  const accessToken = await generateAccessToken(
    userId,
    record.role as "CUSTOMER" | "ADMIN",
    ctx.jwtSecret,
  );
  return { accessToken };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toUser(record: {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  emailVerified: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
}): User {
  return {
    id: record.id as UserId,
    email: record.email as Email,
    passwordHash: record.passwordHash,
    name: record.name,
    role: record.role as "CUSTOMER" | "ADMIN",
    emailVerified: record.emailVerified,
    failedLoginAttempts: record.failedLoginAttempts,
    lockedUntil: record.lockedUntil ? new Date(record.lockedUntil) : null,
    version: 0,
  };
}

async function handleLoginFailure(user: User, ctx: AuthContext): Promise<void> {
  const now = new Date().toISOString();
  const updatedUser = recordLoginFailure(user);

  await ctx.userRepository.update(user.id, {
    failedLoginAttempts: updatedUser.failedLoginAttempts,
    lockedUntil: updatedUser.lockedUntil?.toISOString() ?? null,
    updatedAt: now,
  });

  const currentVersion = await loadCurrentVersion(user.id, ctx.eventStore);
  const loginFailedEvent: UserEvent = { type: "LoginFailed", userId: user.id };

  if (isLocked(updatedUser)) {
    const accountLockedEvent: UserEvent = {
      type: "AccountLocked",
      userId: user.id,
      lockedUntil: updatedUser.lockedUntil!.toISOString(),
    };
    await ctx.eventStore.append(
      user.id,
      "user",
      [
        { type: loginFailedEvent.type, payload: loginFailedEvent },
        { type: accountLockedEvent.type, payload: accountLockedEvent },
      ],
      currentVersion,
    );
    throw { code: "ACCOUNT_LOCKED" as const };
  }

  await ctx.eventStore.append(
    user.id,
    "user",
    [{ type: loginFailedEvent.type, payload: loginFailedEvent }],
    currentVersion,
  );
}
