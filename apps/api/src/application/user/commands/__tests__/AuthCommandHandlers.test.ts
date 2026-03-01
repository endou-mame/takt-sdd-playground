import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleRegister,
  handleLogin,
  handleLogout,
  handleRefreshToken,
  type RegisterCommand,
  type LoginCommand,
  type AuthContext,
} from "../AuthCommandHandlers";
import type { EventStore, StoredEvent } from "../../../../infrastructure/event-store/EventStore";
import type { UserRepository } from "../../../../infrastructure/repository/DrizzleUserRepository";
import type { EmailService } from "../../../../infrastructure/email/EmailService";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("bcryptjs", () => ({
  hash: vi.fn().mockResolvedValue("hashed-password"),
  compare: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../../../infrastructure/auth/JwtService", () => ({
  generateAccessToken: vi.fn().mockResolvedValue("access-token-mock"),
  generateRefreshToken: vi.fn().mockResolvedValue("refresh-token-mock"),
  // Use a literal here; vi.mock factories are hoisted before const declarations
  verifyRefreshToken: vi.fn().mockResolvedValue("00000000-0000-4000-8000-000000000001"),
  invalidateRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_EMAIL = "user@example.com";
const VALID_PASSWORD = "Password123";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeEventStore(events: StoredEvent[] = []): EventStore {
  return {
    append: vi.fn().mockResolvedValue(undefined),
    loadEvents: vi.fn().mockResolvedValue(events),
  };
}

function makeUserRepository(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    findByEmail: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    searchCustomers: vi.fn().mockResolvedValue([]),
    getCustomerDetail: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeEmailService(): EmailService {
  return {
    sendOrderConfirmation: vi.fn().mockResolvedValue(undefined),
    sendPasswordReset: vi.fn().mockResolvedValue(undefined),
    sendRefundNotification: vi.fn().mockResolvedValue(undefined),
    sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  };
}

function makeD1(): D1Database {
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true, results: [], meta: {} }),
    first: vi.fn().mockResolvedValue(null),
  };
  return {
    prepare: vi.fn().mockReturnValue(stmt),
  } as unknown as D1Database;
}

function makeUserRecord(overrides: Partial<{
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  emailVerified: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}> = {}) {
  return {
    id: VALID_USER_ID,
    email: VALID_EMAIL,
    passwordHash: "hashed-password",
    name: "Test User",
    role: "CUSTOMER",
    emailVerified: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    db: makeD1(),
    userRepository: makeUserRepository(),
    eventStore: makeEventStore(),
    emailService: makeEmailService(),
    jwtSecret: "test-secret",
    appBaseUrl: "https://example.com",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// handleRegister
// ---------------------------------------------------------------------------

describe("handleRegister", () => {
  const baseCmd: RegisterCommand = {
    email: VALID_EMAIL,
    password: VALID_PASSWORD,
    name: "Test User",
  };

  it("throws INVALID_EMAIL for malformed email", async () => {
    const ctx = makeContext();
    await expect(
      handleRegister({ ...baseCmd, email: "not-an-email" }, ctx),
    ).rejects.toMatchObject({ code: "INVALID_EMAIL" });
  });

  it("throws INVALID_PASSWORD when password is shorter than 8 characters", async () => {
    const ctx = makeContext();
    await expect(
      handleRegister({ ...baseCmd, password: "short" }, ctx),
    ).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
  });

  it("throws DUPLICATE_EMAIL when email is already registered", async () => {
    const ctx = makeContext({
      userRepository: makeUserRepository({
        findByEmail: vi.fn().mockResolvedValue(makeUserRecord()),
      }),
    });
    await expect(handleRegister(baseCmd, ctx)).rejects.toMatchObject({
      code: "DUPLICATE_EMAIL",
    });
  });

  it("saves user, appends UserRegistered event, and sends verification email on success", async () => {
    const ctx = makeContext();
    const result = await handleRegister(baseCmd, ctx);

    expect(result.userId).toBeTypeOf("string");
    expect(ctx.userRepository.save).toHaveBeenCalledOnce();
    expect(ctx.eventStore.append).toHaveBeenCalledOnce();

    const [aggregateId, aggregateType, events, expectedVersion] =
      (ctx.eventStore.append as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(aggregateType).toBe("user");
    expect(events[0].type).toBe("UserRegistered");
    expect(expectedVersion).toBe(0);
    expect(aggregateId).toBe(result.userId);

    expect(ctx.emailService.sendEmailVerification).toHaveBeenCalledOnce();
    const emailCall = (ctx.emailService.sendEmailVerification as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(emailCall.to).toBe(VALID_EMAIL);
    expect(emailCall.verificationLink).toContain("verify-email?token=");
  });

  it("inserts email verification token into D1", async () => {
    const ctx = makeContext();
    await handleRegister(baseCmd, ctx);

    const prepareCalls = (ctx.db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const insertCall = prepareCalls.find((c: string[]) =>
      c[0]!.includes("email_verification_tokens"),
    );
    expect(insertCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// handleLogin
// ---------------------------------------------------------------------------

describe("handleLogin", () => {
  const baseCmd: LoginCommand = { email: VALID_EMAIL, password: VALID_PASSWORD };

  beforeEach(async () => {
    const { compare } = await import("bcryptjs");
    (compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  it("throws INVALID_CREDENTIALS when user is not found", async () => {
    const ctx = makeContext();
    await expect(handleLogin(baseCmd, ctx)).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  it("throws ACCOUNT_LOCKED when account is locked", async () => {
    const lockedUntil = new Date(Date.now() + 60_000).toISOString();
    const ctx = makeContext({
      userRepository: makeUserRepository({
        findByEmail: vi.fn().mockResolvedValue(makeUserRecord({ lockedUntil })),
      }),
    });
    await expect(handleLogin(baseCmd, ctx)).rejects.toMatchObject({
      code: "ACCOUNT_LOCKED",
    });
  });

  it("throws INVALID_CREDENTIALS and updates failedLoginAttempts on wrong password", async () => {
    const { compare } = await import("bcryptjs");
    (compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(makeUserRecord({ failedLoginAttempts: 0 })),
    });
    const eventStore = makeEventStore([]);
    const ctx = makeContext({ userRepository, eventStore });

    await expect(handleLogin(baseCmd, ctx)).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });

    expect(userRepository.update).toHaveBeenCalledWith(
      VALID_USER_ID,
      expect.objectContaining({ failedLoginAttempts: 1 }),
    );

    const appendCalls = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls;
    expect(appendCalls[0]![2]![0]!.type).toBe("LoginFailed");
  });

  it("throws ACCOUNT_LOCKED and appends AccountLocked event on 5th failure", async () => {
    const { compare } = await import("bcryptjs");
    (compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const eventStore = makeEventStore([
      { id: "1", aggregateId: VALID_USER_ID, aggregateType: "user", version: 4, eventType: "LoginFailed", payload: {}, createdAt: "" },
    ]);
    const ctx = makeContext({
      userRepository: makeUserRepository({
        findByEmail: vi.fn().mockResolvedValue(makeUserRecord({ failedLoginAttempts: 4 })),
      }),
      eventStore,
    });

    await expect(handleLogin(baseCmd, ctx)).rejects.toMatchObject({
      code: "ACCOUNT_LOCKED",
    });

    const appendCalls = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls;
    const eventTypes = appendCalls[0]![2]!.map((e: { type: string }) => e.type);
    expect(eventTypes).toContain("LoginFailed");
    expect(eventTypes).toContain("AccountLocked");
  });

  it("returns tokens on successful login", async () => {
    const ctx = makeContext({
      userRepository: makeUserRepository({
        findByEmail: vi.fn().mockResolvedValue(makeUserRecord()),
      }),
    });

    const result = await handleLogin(baseCmd, ctx);
    expect(result.accessToken).toBe("access-token-mock");
    expect(result.refreshToken).toBe("refresh-token-mock");
  });

  it("resets failedLoginAttempts and appends AccountUnlocked on login after failures", async () => {
    const eventStore = makeEventStore([
      { id: "1", aggregateId: VALID_USER_ID, aggregateType: "user", version: 1, eventType: "LoginFailed", payload: {}, createdAt: "" },
    ]);
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(makeUserRecord({ failedLoginAttempts: 1 })),
    });
    const ctx = makeContext({ userRepository, eventStore });

    await handleLogin(baseCmd, ctx);

    expect(userRepository.update).toHaveBeenCalledWith(
      VALID_USER_ID,
      expect.objectContaining({ failedLoginAttempts: 0, lockedUntil: null }),
    );

    const appendCalls = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls;
    expect(appendCalls[0]![2]![0]!.type).toBe("AccountUnlocked");
  });
});

// ---------------------------------------------------------------------------
// handleLogout
// ---------------------------------------------------------------------------

describe("handleLogout", () => {
  it("calls invalidateRefreshToken with the provided token", async () => {
    const db = makeD1();
    const { invalidateRefreshToken } = await import("../../../../infrastructure/auth/JwtService");

    await handleLogout("test-refresh-token", { db });

    expect(invalidateRefreshToken).toHaveBeenCalledWith("test-refresh-token", db);
  });
});

// ---------------------------------------------------------------------------
// handleRefreshToken
// ---------------------------------------------------------------------------

describe("handleRefreshToken", () => {
  it("throws INVALID_REFRESH_TOKEN when user record is not found", async () => {
    const { verifyRefreshToken } = await import("../../../../infrastructure/auth/JwtService");
    (verifyRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue(VALID_USER_ID);

    const ctx = {
      db: makeD1(),
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(null) }),
      jwtSecret: "test-secret",
    };

    await expect(
      handleRefreshToken({ refreshToken: "valid-token" }, ctx),
    ).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN" });
  });

  it("returns a new accessToken on valid refresh token", async () => {
    const { verifyRefreshToken } = await import("../../../../infrastructure/auth/JwtService");
    (verifyRefreshToken as ReturnType<typeof vi.fn>).mockResolvedValue(VALID_USER_ID);

    const ctx = {
      db: makeD1(),
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUserRecord()),
      }),
      jwtSecret: "test-secret",
    };

    const result = await handleRefreshToken({ refreshToken: "valid-token" }, ctx);
    expect(result.accessToken).toBe("access-token-mock");
  });

  it("propagates INVALID_REFRESH_TOKEN from verifyRefreshToken", async () => {
    const { verifyRefreshToken } = await import("../../../../infrastructure/auth/JwtService");
    (verifyRefreshToken as ReturnType<typeof vi.fn>).mockRejectedValue({
      code: "INVALID_REFRESH_TOKEN",
    });

    const ctx = {
      db: makeD1(),
      userRepository: makeUserRepository(),
      jwtSecret: "test-secret",
    };

    await expect(
      handleRefreshToken({ refreshToken: "bad-token" }, ctx),
    ).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN" });
  });
});
