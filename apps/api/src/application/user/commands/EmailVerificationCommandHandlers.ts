import type { EventStore } from "../../../infrastructure/event-store/EventStore";
import type { UserProjection } from "../../../infrastructure/projection/UserProjection";
import type { UserEvent } from "../../../domain/user/UserEvents";
import { loadCurrentVersion } from "./userCommandUtils";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type EmailVerificationContext = {
  readonly db: D1Database;
  readonly eventStore: EventStore;
  readonly userProjection: UserProjection;
};

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

export type VerifyEmailCommand = {
  readonly token: string;
};

// ---------------------------------------------------------------------------
// handleVerifyEmail
// ---------------------------------------------------------------------------

export async function handleVerifyEmail(
  cmd: VerifyEmailCommand,
  ctx: EmailVerificationContext,
): Promise<void> {
  const row = await ctx.db
    .prepare(
      "SELECT user_id, expires_at, used FROM email_verification_tokens WHERE token = ?",
    )
    .bind(cmd.token)
    .first<{ user_id: string; expires_at: string; used: number }>();

  if (!row || row.used === 1) {
    throw { code: "VERIFICATION_TOKEN_USED" as const };
  }

  if (new Date(row.expires_at) < new Date()) {
    throw { code: "VERIFICATION_TOKEN_EXPIRED" as const };
  }

  const emailVerifiedEvent: UserEvent = { type: "EmailVerified", userId: row.user_id };

  await ctx.userProjection.apply(emailVerifiedEvent);

  // Mark the token as consumed before appending the audit event
  await ctx.db
    .prepare("UPDATE email_verification_tokens SET used = 1 WHERE token = ?")
    .bind(cmd.token)
    .run();

  const currentVersion = await loadCurrentVersion(row.user_id, ctx.eventStore);
  await ctx.eventStore.append(
    row.user_id,
    "user",
    [{ type: emailVerifiedEvent.type, payload: emailVerifiedEvent }],
    currentVersion,
  );
}

