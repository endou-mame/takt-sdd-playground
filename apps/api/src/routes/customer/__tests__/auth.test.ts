import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { authRouter } from "../auth";
import type { Bindings } from "../../../worker";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../../application/user/commands/AuthCommandHandlers", () => ({
  handleRegister: vi.fn(),
  handleLogin: vi.fn(),
  handleLogout: vi.fn(),
  handleRefreshToken: vi.fn(),
}));

vi.mock("../../../application/user/commands/PasswordResetCommandHandlers", () => ({
  handleRequestPasswordReset: vi.fn(),
  handleCompletePasswordReset: vi.fn(),
}));

vi.mock("../../../application/user/commands/EmailVerificationCommandHandlers", () => ({
  handleVerifyEmail: vi.fn(),
}));

vi.mock("../../../infrastructure/event-store/D1EventStore", () => ({
  D1EventStore: vi.fn(),
}));
vi.mock("../../../infrastructure/repository/DrizzleUserRepository", () => ({
  DrizzleUserRepository: vi.fn(),
}));
vi.mock("../../../infrastructure/email/ResendEmailService", () => ({
  ResendEmailService: vi.fn(),
}));
vi.mock("../../../infrastructure/projection/UserProjection", () => ({
  UserProjection: vi.fn(),
}));
vi.mock("../../../middleware/authMiddleware", () => ({
  authMiddleware: vi.fn(async (c: { get: (k: string) => unknown; set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("userId", "test-user-id");
    c.set("role", "CUSTOMER");
    await next();
  }),
  adminMiddleware: vi.fn(async (_c: unknown, next: () => Promise<void>) => { await next(); }),
}));

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

function makeApp() {
  const app = new Hono<{ Bindings: Bindings }>();
  app.route("/auth", authRouter);
  return app;
}

function makeEnv(): Bindings {
  return {
    EVENTS_DB: {} as D1Database,
    IMAGE_BUCKET: {} as R2Bucket,
    CART_DO: {} as DurableObjectNamespace,
    EMAIL_QUEUE: {} as Queue,
    RESEND_API_KEY: "resend-key",
    RESEND_FROM_ADDRESS: "no-reply@example.com",
    JWT_SECRET: "secret",
    APP_BASE_URL: "https://example.com",
    STRIPE_API_KEY: "stripe-key",
    R2_PUBLIC_URL: "https://pub.r2.dev",
  };
}

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------

describe("POST /auth/register", () => {
  beforeEach(async () => {
    const { handleRegister } = await import("../../../application/user/commands/AuthCommandHandlers");
    (handleRegister as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: "new-user-id" });
  });

  it("returns 201 with userId on valid input", async () => {
    const app = makeApp();
    const res = await app.request(
      "/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "a@example.com", password: "password123", name: "Alice" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { userId: string };
    expect(body.userId).toBe("new-user-id");
  });

  it("returns 400 VALIDATION_ERROR when required fields are missing", async () => {
    const app = makeApp();
    const res = await app.request(
      "/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "a@example.com" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

describe("POST /auth/login", () => {
  beforeEach(async () => {
    const { handleLogin } = await import("../../../application/user/commands/AuthCommandHandlers");
    (handleLogin as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  it("returns 200 with tokens on valid credentials", async () => {
    const app = makeApp();
    const res = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "a@example.com", password: "password123" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { accessToken: string; refreshToken: string };
    expect(body.accessToken).toBe("access-token");
    expect(body.refreshToken).toBe("refresh-token");
  });

  it("returns 400 VALIDATION_ERROR when password is missing", async () => {
    const app = makeApp();
    const res = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "a@example.com" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

describe("POST /auth/logout", () => {
  it("returns 200 on successful logout", async () => {
    const { handleLogout } = await import("../../../application/user/commands/AuthCommandHandlers");
    (handleLogout as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = makeApp();
    app.onError((err, c) => {
      return c.json({ error: { code: (err as { code?: string }).code ?? "UNKNOWN", message: "", fields: [] } }, 500);
    });
    const res = await app.request(
      "/auth/logout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "some-refresh-token" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/password-reset
// ---------------------------------------------------------------------------

describe("POST /auth/password-reset", () => {
  it("returns 200 on valid email (even if email doesn't exist)", async () => {
    const { handleRequestPasswordReset } = await import(
      "../../../application/user/commands/PasswordResetCommandHandlers"
    );
    (handleRequestPasswordReset as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = makeApp();
    const res = await app.request(
      "/auth/password-reset",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "a@example.com" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 when email field is missing", async () => {
    const app = makeApp();
    const res = await app.request(
      "/auth/password-reset",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });
});
