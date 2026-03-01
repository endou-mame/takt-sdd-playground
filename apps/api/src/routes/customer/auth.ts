import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "../../worker";
import type { AuthVariables } from "../../middleware/authMiddleware";
import { authMiddleware } from "../../middleware/authMiddleware";
import {
  handleRegister,
  handleLogin,
  handleLogout,
  handleRefreshToken,
} from "../../application/user/commands/AuthCommandHandlers";
import {
  handleRequestPasswordReset,
  handleCompletePasswordReset,
} from "../../application/user/commands/PasswordResetCommandHandlers";
import { handleVerifyEmail } from "../../application/user/commands/EmailVerificationCommandHandlers";
import { D1EventStore } from "../../infrastructure/event-store/D1EventStore";
import { DrizzleUserRepository } from "../../infrastructure/repository/DrizzleUserRepository";
import { ResendEmailService } from "../../infrastructure/email/ResendEmailService";
import { UserProjection } from "../../infrastructure/projection/UserProjection";
import { toValidationErrorResponse } from "../utils";

type AppEnv = { Bindings: Bindings; Variables: AuthVariables };

export const authRouter = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const RegisterSchema = z.object({
  email: z.string(),
  password: z.string(),
  name: z.string(),
});

const LoginSchema = z.object({
  email: z.string(),
  password: z.string(),
});

const RefreshSchema = z.object({
  refreshToken: z.string(),
});

const PasswordResetRequestSchema = z.object({
  email: z.string(),
});

const PasswordResetConfirmSchema = z.object({
  token: z.string(),
  newPassword: z.string(),
});

const VerifyEmailSchema = z.object({
  token: z.string(),
});

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------

authRouter.post("/register", async (c) => {
  const body = await c.req.json<unknown>();
  const result = RegisterSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const ctx = buildAuthContext(c.env);
  const { userId } = await handleRegister(result.data, ctx);
  return c.json({ userId }, 201);
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

authRouter.post("/login", async (c) => {
  const body = await c.req.json<unknown>();
  const result = LoginSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const ctx = buildAuthContext(c.env);
  const tokens = await handleLogin(result.data, ctx);
  return c.json(tokens);
});

// ---------------------------------------------------------------------------
// POST /auth/logout (requires auth)
// ---------------------------------------------------------------------------

authRouter.post("/logout", authMiddleware, async (c) => {
  const body = await c.req.json<unknown>();
  const result = RefreshSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  await handleLogout(result.data.refreshToken, { db: c.env.EVENTS_DB });
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------

authRouter.post("/refresh", async (c) => {
  const body = await c.req.json<unknown>();
  const result = RefreshSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const ctx = {
    db: c.env.EVENTS_DB,
    userRepository: new DrizzleUserRepository(c.env.EVENTS_DB),
    jwtSecret: c.env.JWT_SECRET,
  };
  const tokens = await handleRefreshToken(result.data, ctx);
  return c.json(tokens);
});

// ---------------------------------------------------------------------------
// POST /auth/password-reset
// ---------------------------------------------------------------------------

authRouter.post("/password-reset", async (c) => {
  const body = await c.req.json<unknown>();
  const result = PasswordResetRequestSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const ctx = buildPasswordResetContext(c.env);
  await handleRequestPasswordReset(result.data, ctx);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /auth/password-reset/confirm
// ---------------------------------------------------------------------------

authRouter.post("/password-reset/confirm", async (c) => {
  const body = await c.req.json<unknown>();
  const result = PasswordResetConfirmSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const ctx = buildPasswordResetContext(c.env);
  await handleCompletePasswordReset(result.data, ctx);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /auth/verify-email
// ---------------------------------------------------------------------------

authRouter.post("/verify-email", async (c) => {
  const body = await c.req.json<unknown>();
  const result = VerifyEmailSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const ctx = {
    db: c.env.EVENTS_DB,
    eventStore: new D1EventStore(c.env.EVENTS_DB),
    userProjection: new UserProjection(c.env.EVENTS_DB),
  };
  await handleVerifyEmail(result.data, ctx);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Context builders
// ---------------------------------------------------------------------------

function buildAuthContext(env: Bindings) {
  return {
    db: env.EVENTS_DB,
    userRepository: new DrizzleUserRepository(env.EVENTS_DB),
    eventStore: new D1EventStore(env.EVENTS_DB),
    emailService: new ResendEmailService(env.RESEND_API_KEY, env.RESEND_FROM_ADDRESS),
    jwtSecret: env.JWT_SECRET,
    appBaseUrl: env.APP_BASE_URL,
  };
}

function buildPasswordResetContext(env: Bindings) {
  return {
    db: env.EVENTS_DB,
    userRepository: new DrizzleUserRepository(env.EVENTS_DB),
    eventStore: new D1EventStore(env.EVENTS_DB),
    emailService: new ResendEmailService(env.RESEND_API_KEY, env.RESEND_FROM_ADDRESS),
    appBaseUrl: env.APP_BASE_URL,
  };
}
