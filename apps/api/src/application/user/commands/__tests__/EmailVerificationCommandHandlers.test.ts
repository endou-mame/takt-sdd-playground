import { describe, it, expect, vi } from "vitest";
import {
  handleVerifyEmail,
  type EmailVerificationContext,
} from "../EmailVerificationCommandHandlers";
import type { EventStore, StoredEvent } from "../../../../infrastructure/event-store/EventStore";
import type { UserProjection } from "../../../../infrastructure/projection/UserProjection";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
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

function makeUserProjection(): UserProjection {
  return { apply: vi.fn().mockResolvedValue(undefined) } as unknown as UserProjection;
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

function makeContext(
  overrides: Partial<EmailVerificationContext> = {},
): EmailVerificationContext {
  return {
    db: makeD1WithFirst(null),
    eventStore: makeEventStore(),
    userProjection: makeUserProjection(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// handleVerifyEmail
// ---------------------------------------------------------------------------

describe("handleVerifyEmail", () => {
  it("throws VERIFICATION_TOKEN_USED when token is not found", async () => {
    const ctx = makeContext({ db: makeD1WithFirst(null) });
    await expect(handleVerifyEmail({ token: VALID_TOKEN }, ctx)).rejects.toMatchObject({
      code: "VERIFICATION_TOKEN_USED",
    });
  });

  it("throws VERIFICATION_TOKEN_USED when token is already used", async () => {
    const usedToken = { user_id: VALID_USER_ID, expires_at: "2099-01-01T00:00:00Z", used: 1 };
    const ctx = makeContext({ db: makeD1WithFirst(usedToken) });
    await expect(handleVerifyEmail({ token: VALID_TOKEN }, ctx)).rejects.toMatchObject({
      code: "VERIFICATION_TOKEN_USED",
    });
  });

  it("throws VERIFICATION_TOKEN_EXPIRED when token has expired", async () => {
    const expiredToken = { user_id: VALID_USER_ID, expires_at: "2000-01-01T00:00:00Z", used: 0 };
    const ctx = makeContext({ db: makeD1WithFirst(expiredToken) });
    await expect(handleVerifyEmail({ token: VALID_TOKEN }, ctx)).rejects.toMatchObject({
      code: "VERIFICATION_TOKEN_EXPIRED",
    });
  });

  it("applies EmailVerified projection, marks token used, and appends event on success", async () => {
    const validToken = {
      user_id: VALID_USER_ID,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      used: 0,
    };
    const db = makeD1WithFirst(validToken);
    const userProjection = makeUserProjection();
    const eventStore = makeEventStore();
    const ctx = makeContext({ db, userProjection, eventStore });

    await handleVerifyEmail({ token: VALID_TOKEN }, ctx);

    expect(userProjection.apply).toHaveBeenCalledOnce();
    const appliedEvent = (userProjection.apply as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(appliedEvent.type).toBe("EmailVerified");
    expect(appliedEvent.userId).toBe(VALID_USER_ID);

    const prepareCalls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const updateCall = prepareCalls.find((c: string[]) =>
      c[0]!.includes("UPDATE email_verification_tokens"),
    );
    expect(updateCall).toBeDefined();

    const appendCalls = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls;
    expect(appendCalls[0]![2]![0]!.type).toBe("EmailVerified");
    expect(appendCalls[0]![0]!).toBe(VALID_USER_ID);
    expect(appendCalls[0]![1]!).toBe("user");
  });

  it("applies projection before marking token used (ordering check)", async () => {
    const validToken = {
      user_id: VALID_USER_ID,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      used: 0,
    };
    const callOrder: string[] = [];
    const db = makeD1WithFirst(validToken);
    const stmtMock = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockImplementation(() => {
        callOrder.push("db.run");
        return Promise.resolve({ success: true, results: [], meta: {} });
      }),
      first: vi.fn().mockResolvedValue(validToken),
    };
    const orderedDb = {
      prepare: vi.fn().mockReturnValue(stmtMock),
    } as unknown as D1Database;

    const userProjection: UserProjection = {
      apply: vi.fn().mockImplementation(() => {
        callOrder.push("projection.apply");
        return Promise.resolve();
      }),
    } as unknown as UserProjection;

    await handleVerifyEmail({ token: VALID_TOKEN }, { db: orderedDb, userProjection, eventStore: makeEventStore() });

    const projectionIdx = callOrder.indexOf("projection.apply");
    const updateIdx = callOrder.indexOf("db.run");
    expect(projectionIdx).toBeLessThan(updateIdx);
  });
});
