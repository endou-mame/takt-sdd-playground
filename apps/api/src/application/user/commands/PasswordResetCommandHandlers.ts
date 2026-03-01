import { hash } from "bcryptjs";
import type { EventStore } from "../../../infrastructure/event-store/EventStore";
import type { UserRepository } from "../../../infrastructure/repository/DrizzleUserRepository";
import type { EmailService } from "../../../infrastructure/email/EmailService";
import type { UserEvent } from "../../../domain/user/UserEvents";
import type { UserId } from "../../../domain/shared/ValueObjects";
import { invalidateAllRefreshTokens } from "../../../infrastructure/auth/JwtService";
import { loadCurrentVersion } from "./userCommandUtils";

const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const BCRYPT_COST = 12;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type PasswordResetContext = {
  readonly db: D1Database;
  readonly userRepository: UserRepository;
  readonly eventStore: EventStore;
  readonly emailService: EmailService;
  readonly appBaseUrl: string;
};

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

export type RequestPasswordResetCommand = {
  readonly email: string;
};

export type CompletePasswordResetCommand = {
  readonly token: string;
  readonly newPassword: string;
};

// ---------------------------------------------------------------------------
// handleRequestPasswordReset
// ---------------------------------------------------------------------------

export async function handleRequestPasswordReset(
  cmd: RequestPasswordResetCommand,
  ctx: PasswordResetContext,
): Promise<void> {
  const user = await ctx.userRepository.findByEmail(cmd.email);

  // Always return success regardless of whether the email exists
  // to prevent leaking email address existence.
  if (!user) return;

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS).toISOString();

  await ctx.db
    .prepare(
      "INSERT INTO password_reset_tokens (token, user_id, expires_at, used) VALUES (?, ?, ?, 0)",
    )
    .bind(token, user.id, expiresAt)
    .run();

  const currentVersion = await loadCurrentVersion(user.id, ctx.eventStore);
  const event: UserEvent = { type: "PasswordResetRequested", userId: user.id };
  await ctx.eventStore.append(
    user.id,
    "user",
    [{ type: event.type, payload: event }],
    currentVersion,
  );

  const resetLink = `${ctx.appBaseUrl}/auth/reset-password?token=${token}`;
  await ctx.emailService.sendPasswordReset({ to: user.email, resetLink });
}

// ---------------------------------------------------------------------------
// handleCompletePasswordReset
// ---------------------------------------------------------------------------

export async function handleCompletePasswordReset(
  cmd: CompletePasswordResetCommand,
  ctx: PasswordResetContext,
): Promise<void> {
  const row = await ctx.db
    .prepare("SELECT user_id, expires_at, used FROM password_reset_tokens WHERE token = ?")
    .bind(cmd.token)
    .first<{ user_id: string; expires_at: string; used: number }>();

  if (!row || row.used === 1) {
    throw { code: "VERIFICATION_TOKEN_USED" as const };
  }

  if (new Date(row.expires_at) < new Date()) {
    throw { code: "VERIFICATION_TOKEN_EXPIRED" as const };
  }

  if (cmd.newPassword.length < 8) {
    throw { code: "INVALID_PASSWORD" as const };
  }

  const passwordHash = await hash(cmd.newPassword, BCRYPT_COST);
  const now = new Date().toISOString();

  await ctx.userRepository.update(row.user_id, { passwordHash, updatedAt: now });

  await invalidateAllRefreshTokens(row.user_id as UserId, ctx.db);

  await ctx.db
    .prepare("UPDATE password_reset_tokens SET used = 1 WHERE token = ?")
    .bind(cmd.token)
    .run();

  const currentVersion = await loadCurrentVersion(row.user_id, ctx.eventStore);
  const event: UserEvent = { type: "PasswordReset", userId: row.user_id };
  await ctx.eventStore.append(
    row.user_id,
    "user",
    [{ type: event.type, payload: event }],
    currentVersion,
  );
}

