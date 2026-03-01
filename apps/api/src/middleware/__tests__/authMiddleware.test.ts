/**
 * Tests for authMiddleware and adminMiddleware.
 *
 * These tests use the real middleware implementations — neither authMiddleware
 * nor JwtService are mocked. JWT tokens are generated with generateAccessToken
 * using a test secret, and the errorHandler converts domain errors to HTTP
 * responses so status codes can be asserted directly.
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { authMiddleware, adminMiddleware } from "../authMiddleware";
import { errorHandler } from "../errorHandler";
import { generateAccessToken } from "../../infrastructure/auth/JwtService";
import type { Bindings } from "../../worker";
import type { UserId } from "../../domain/shared/ValueObjects";

const TEST_SECRET = "test-secret-key-must-be-at-least-32-chars-long";
const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000" as UserId;

function makeApp() {
  const app = new Hono<{ Bindings: Bindings }>();
  app.onError(errorHandler);
  app.get("/protected", authMiddleware, (c) => c.json({ ok: true }));
  app.get("/admin-only", authMiddleware, adminMiddleware, (c) =>
    c.json({ ok: true }),
  );
  return app;
}

function makeEnv(): Bindings {
  return {
    EVENTS_DB: {} as D1Database,
    IMAGE_BUCKET: {} as R2Bucket,
    CART_DO: {} as DurableObjectNamespace,
    EMAIL_QUEUE: {} as Queue,
    RESEND_API_KEY: "key",
    RESEND_FROM_ADDRESS: "no-reply@example.com",
    JWT_SECRET: TEST_SECRET,
    APP_BASE_URL: "https://example.com",
    STRIPE_API_KEY: "stripe-key",
    R2_PUBLIC_URL: "https://pub.r2.dev",
  };
}

// ---------------------------------------------------------------------------
// authMiddleware — token validation
// ---------------------------------------------------------------------------

describe("authMiddleware", () => {
  it("returns 401 when Authorization header is absent", async () => {
    const app = makeApp();
    const res = await app.request("/protected", {}, makeEnv());
    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_TOKEN");
  });

  it("returns 401 for a malformed JWT (not three dot-separated segments)", async () => {
    const app = makeApp();
    const res = await app.request(
      "/protected",
      { headers: { Authorization: "Bearer not.a.jwt" } },
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for a JWT signed with a different secret", async () => {
    const wrongToken = await generateAccessToken(
      TEST_USER_ID,
      "CUSTOMER",
      "wrong-secret-key-that-is-long-enough!!!!",
    );
    const app = makeApp();
    const res = await app.request(
      "/protected",
      { headers: { Authorization: `Bearer ${wrongToken}` } },
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for an expired JWT", async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredToken = await sign(
      { sub: TEST_USER_ID, role: "CUSTOMER", iat: now - 7200, exp: now - 3600 },
      TEST_SECRET,
      "HS256",
    );
    const app = makeApp();
    const res = await app.request(
      "/protected",
      { headers: { Authorization: `Bearer ${expiredToken}` } },
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("passes through and returns 200 for a valid CUSTOMER token", async () => {
    const token = await generateAccessToken(TEST_USER_ID, "CUSTOMER", TEST_SECRET);
    const app = makeApp();
    const res = await app.request(
      "/protected",
      { headers: { Authorization: `Bearer ${token}` } },
      makeEnv(),
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// adminMiddleware — role check
// ---------------------------------------------------------------------------

describe("adminMiddleware", () => {
  it("returns 403 when a CUSTOMER token is used on an admin-only route", async () => {
    const token = await generateAccessToken(TEST_USER_ID, "CUSTOMER", TEST_SECRET);
    const app = makeApp();
    const res = await app.request(
      "/admin-only",
      { headers: { Authorization: `Bearer ${token}` } },
      makeEnv(),
    );
    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("passes through and returns 200 for a valid ADMIN token", async () => {
    const token = await generateAccessToken(TEST_USER_ID, "ADMIN", TEST_SECRET);
    const app = makeApp();
    const res = await app.request(
      "/admin-only",
      { headers: { Authorization: `Bearer ${token}` } },
      makeEnv(),
    );
    expect(res.status).toBe(200);
  });
});
