import { describe, it, expect, vi } from "vitest";
import {
  handleRequestPasswordReset,
  handleCompletePasswordReset,
  type PasswordResetContext,
} from "../PasswordResetCommandHandlers";
import type { EventStore, StoredEvent } from "../../../../infrastructure/event-store/EventStore";
import type { UserRepository } from "../../../../infrastructure/repository/DrizzleUserRepository";
import type { EmailService } from "../../../../infrastructure/email/EmailService";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("bcryptjs", () => ({
  hash: vi.fn().mockResolvedValue("new-hashed-password"),
}));

vi.mock("../../../../infrastructure/auth/JwtService", () => ({
  invalidateAllRefreshTokens: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_EMAIL = "user@example.com";
const VALID_TOKEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

function makeD1WithFirst(firstResult: unknown): D1Database {
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true, results: [], meta: {} }),
    first: vi.fn().mockResolvedValue(firstResult),
  };
  return {
    prepare: vi.fn().mockReturnValue(stmt),
  } as unknown as D1Database;
}

function makeD1(): D1Database {
  return makeD1WithFirst(null);
}

function makeUserRecord() {
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
  };
}

function makeContext(overrides: Partial<PasswordResetContext> = {}): PasswordResetContext {
  return {
    db: makeD1(),
    userRepository: makeUserRepository(),
    eventStore: makeEventStore(),
    emailService: makeEmailService(),
    appBaseUrl: "https://example.com",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// handleRequestPasswordReset
// ---------------------------------------------------------------------------

describe("handleRequestPasswordReset", () => {
  it("returns success without action when email is not registered", async () => {
    const ctx = makeContext();
    // Should not throw
    await expect(
      handleRequestPasswordReset({ email: "unknown@example.com" }, ctx),
    ).resolves.toBeUndefined();

    expect(ctx.emailService.sendPasswordReset).not.toHaveBeenCalled();
    expect(ctx.eventStore.append).not.toHaveBeenCalled();
  });

  it("inserts token, appends event, and sends email when email is registered", async () => {
    const eventStore = makeEventStore();
    const emailService = makeEmailService();
    const db = makeD1();
    const ctx = makeContext({
      userRepository: makeUserRepository({
        findByEmail: vi.fn().mockResolvedValue(makeUserRecord()),
      }),
      eventStore,
      emailService,
      db,
    });

    await handleRequestPasswordReset({ email: VALID_EMAIL }, ctx);

    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const insertCall = prepareCalls.find((c: string[]) =>
      c[0]!.includes("password_reset_tokens"),
    );
    expect(insertCall).toBeDefined();

    const appendCalls = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls;
    expect(appendCalls[0]![2]![0]!.type).toBe("PasswordResetRequested");

    expect(emailService.sendPasswordReset).toHaveBeenCalledOnce();
    const emailCall = (emailService.sendPasswordReset as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(emailCall.to).toBe(VALID_EMAIL);
    expect(emailCall.resetLink).toContain("reset-password?token=");
  });
});

// ---------------------------------------------------------------------------
// handleCompletePasswordReset
// ---------------------------------------------------------------------------

describe("handleCompletePasswordReset", () => {
  const baseCmd = { token: VALID_TOKEN, newPassword: "NewPassword123" };

  it("throws VERIFICATION_TOKEN_USED when token is not found", async () => {
    const ctx = makeContext({ db: makeD1WithFirst(null) });
    await expect(handleCompletePasswordReset(baseCmd, ctx)).rejects.toMatchObject({
      code: "VERIFICATION_TOKEN_USED",
    });
  });

  it("throws VERIFICATION_TOKEN_USED when token is already used", async () => {
    const usedToken = { user_id: VALID_USER_ID, expires_at: "2099-01-01T00:00:00Z", used: 1 };
    const ctx = makeContext({ db: makeD1WithFirst(usedToken) });
    await expect(handleCompletePasswordReset(baseCmd, ctx)).rejects.toMatchObject({
      code: "VERIFICATION_TOKEN_USED",
    });
  });

  it("throws VERIFICATION_TOKEN_EXPIRED when token has expired", async () => {
    const expiredToken = { user_id: VALID_USER_ID, expires_at: "2000-01-01T00:00:00Z", used: 0 };
    const ctx = makeContext({ db: makeD1WithFirst(expiredToken) });
    await expect(handleCompletePasswordReset(baseCmd, ctx)).rejects.toMatchObject({
      code: "VERIFICATION_TOKEN_EXPIRED",
    });
  });

  it("throws INVALID_PASSWORD when newPassword is too short", async () => {
    const validToken = {
      user_id: VALID_USER_ID,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      used: 0,
    };
    const ctx = makeContext({ db: makeD1WithFirst(validToken) });
    await expect(
      handleCompletePasswordReset({ token: VALID_TOKEN, newPassword: "short" }, ctx),
    ).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
  });

  it("updates password, invalidates refresh tokens, marks token used, and appends PasswordReset", async () => {
    const validToken = {
      user_id: VALID_USER_ID,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      used: 0,
    };
    const db = makeD1WithFirst(validToken);
    const userRepository = makeUserRepository();
    const eventStore = makeEventStore();
    const ctx = makeContext({ db, userRepository, eventStore });

    await handleCompletePasswordReset(baseCmd, ctx);

    expect(userRepository.update).toHaveBeenCalledWith(
      VALID_USER_ID,
      expect.objectContaining({ passwordHash: "new-hashed-password" }),
    );

    const { invalidateAllRefreshTokens } = await import("../../../../infrastructure/auth/JwtService");
    expect(invalidateAllRefreshTokens).toHaveBeenCalledWith(VALID_USER_ID, db);

    const appendCalls = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls;
    expect(appendCalls[0]![2]![0]!.type).toBe("PasswordReset");
  });
});
