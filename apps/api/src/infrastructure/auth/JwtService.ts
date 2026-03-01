import { sign, verify } from "hono/jwt";
import type { UserId } from "../../domain/shared/ValueObjects";
import type { UserRole } from "../../domain/user/User";

const ACCESS_TOKEN_EXPIRY_SEC = 3600;
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const JWT_ALGORITHM = "HS256" as const;

type AccessTokenPayload = {
  sub: string;
  role: UserRole;
};

// ---------------------------------------------------------------------------
// Access token
// ---------------------------------------------------------------------------

export async function generateAccessToken(
  userId: UserId,
  role: UserRole,
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: userId, role, iat: now, exp: now + ACCESS_TOKEN_EXPIRY_SEC },
    secret,
    JWT_ALGORITHM,
  );
}

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<AccessTokenPayload> {
  try {
    const payload = await verify(token, secret, JWT_ALGORITHM);
    if (typeof payload["sub"] !== "string" || typeof payload["role"] !== "string") {
      throw Object.assign(new Error("INVALID_TOKEN"), { code: "INVALID_TOKEN" as const });
    }
    const role = payload["role"];
    if (role !== "CUSTOMER" && role !== "ADMIN") {
      throw Object.assign(new Error("INVALID_TOKEN"), { code: "INVALID_TOKEN" as const });
    }
    return { sub: payload["sub"], role };
  } catch (err) {
    if (err !== null && typeof err === "object" && "code" in err) {
      throw err;
    }
    if (err instanceof Error && err.name === "JwtTokenExpired") {
      throw Object.assign(new Error("TOKEN_EXPIRED"), { code: "TOKEN_EXPIRED" as const });
    }
    throw Object.assign(new Error("INVALID_TOKEN"), { code: "INVALID_TOKEN" as const });
  }
}

// ---------------------------------------------------------------------------
// Refresh token
// ---------------------------------------------------------------------------

export async function generateRefreshToken(
  userId: UserId,
  db: D1Database,
): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS).toISOString();

  await db
    .prepare(
      "INSERT INTO refresh_tokens (token, user_id, expires_at, invalidated) VALUES (?, ?, ?, 0)",
    )
    .bind(token, userId, expiresAt)
    .run();

  return token;
}

export async function verifyRefreshToken(
  token: string,
  db: D1Database,
): Promise<UserId> {
  const row = await db
    .prepare(
      "SELECT user_id FROM refresh_tokens WHERE token = ? AND invalidated = 0 AND expires_at > datetime('now')",
    )
    .bind(token)
    .first<{ user_id: string }>();

  if (!row) {
    throw { code: "INVALID_REFRESH_TOKEN" as const };
  }

  return row.user_id as UserId;
}

export async function invalidateRefreshToken(
  token: string,
  db: D1Database,
): Promise<void> {
  await db
    .prepare("UPDATE refresh_tokens SET invalidated = 1 WHERE token = ?")
    .bind(token)
    .run();
}

/** Invalidates all refresh tokens for a user (e.g. on password reset). */
export async function invalidateAllRefreshTokens(
  userId: UserId,
  db: D1Database,
): Promise<void> {
  await db
    .prepare("UPDATE refresh_tokens SET invalidated = 1 WHERE user_id = ?")
    .bind(userId)
    .run();
}
