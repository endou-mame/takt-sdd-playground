import { describe, it, expect } from "vitest";
import {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  invalidateRefreshToken,
  invalidateAllRefreshTokens,
} from "../JwtService";
import type { UserId } from "../../../domain/shared/ValueObjects";

const TEST_SECRET = "test-secret-key-must-be-at-least-32-chars-long";
const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000" as UserId;

// ---------------------------------------------------------------------------
// Mock D1 for refresh token operations
// ---------------------------------------------------------------------------

type RefreshTokenRow = {
  token: string;
  user_id: string;
  expires_at: string;
  invalidated: number;
};

const EMPTY_META = {
  duration: 0,
  size_after: 0,
  rows_read: 0,
  rows_written: 0,
  last_row_id: 0,
  changed_db: false,
  changes: 0,
} as const;

function createRefreshTokenD1Mock(): D1Database {
  const rows: RefreshTokenRow[] = [];

  function makeStatement(sql: string, params: unknown[]): D1PreparedStatement {
    const lower = sql.toLowerCase().trimStart();

    const stmt: {
      bind(...values: unknown[]): D1PreparedStatement;
      run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
      all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
      first<T = Record<string, unknown>>(col?: string): Promise<T | null>;
      raw<T = unknown[]>(opts?: { columnNames?: boolean }): Promise<T[]>;
    } = {
      bind(...values: unknown[]): D1PreparedStatement {
        return makeStatement(sql, values);
      },

      async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        if (lower.startsWith("insert")) {
          rows.push({
            token: params[0] as string,
            user_id: params[1] as string,
            expires_at: params[2] as string,
            invalidated: 0,
          });
        } else if (lower.startsWith("update")) {
          if (lower.includes("where token")) {
            const target = params[0] as string;
            for (const row of rows) {
              if (row.token === target) row.invalidated = 1;
            }
          } else if (lower.includes("where user_id")) {
            const target = params[0] as string;
            for (const row of rows) {
              if (row.user_id === target) row.invalidated = 1;
            }
          }
        }
        return { success: true, results: [] as T[], meta: { ...EMPTY_META } };
      },

      async first<T = Record<string, unknown>>(): Promise<T | null> {
        if (lower.startsWith("select")) {
          const token = params[0] as string;
          const now = new Date().toISOString();
          const row = rows.find(
            (r) =>
              r.token === token && r.invalidated === 0 && r.expires_at > now,
          );
          if (!row) return null;
          return { user_id: row.user_id } as T;
        }
        return null;
      },

      async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        return { success: true, results: [] as T[], meta: { ...EMPTY_META } };
      },

      raw<T = unknown[]>(): Promise<T[]> {
        throw new Error("raw() not implemented in refresh token mock");
      },
    };

    return stmt as unknown as D1PreparedStatement;
  }

  return {
    prepare(query: string): D1PreparedStatement {
      return makeStatement(query, []);
    },
    batch<T>(): Promise<D1Result<T>[]> {
      throw new Error("batch() not implemented in refresh token mock");
    },
    exec(): Promise<D1ExecResult> {
      throw new Error("exec() not implemented in refresh token mock");
    },
    withSession(): D1DatabaseSession {
      throw new Error("withSession() not implemented in refresh token mock");
    },
    dump(): Promise<ArrayBuffer> {
      throw new Error("dump() not implemented in refresh token mock");
    },
  } as unknown as D1Database;
}

// ---------------------------------------------------------------------------
// Access token tests
// ---------------------------------------------------------------------------

describe("generateAccessToken / verifyAccessToken", () => {
  it("generates a token that can be verified", async () => {
    const token = await generateAccessToken(
      TEST_USER_ID,
      "CUSTOMER",
      TEST_SECRET,
    );
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);

    const payload = await verifyAccessToken(token, TEST_SECRET);
    expect(payload.sub).toBe(TEST_USER_ID);
    expect(payload.role).toBe("CUSTOMER");
  });

  it("preserves the ADMIN role in the token payload", async () => {
    const token = await generateAccessToken(TEST_USER_ID, "ADMIN", TEST_SECRET);
    const payload = await verifyAccessToken(token, TEST_SECRET);
    expect(payload.role).toBe("ADMIN");
  });

  it("throws INVALID_TOKEN for a completely invalid token string", async () => {
    await expect(
      verifyAccessToken("not.a.valid.token", TEST_SECRET),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("throws INVALID_TOKEN when verified with a wrong secret", async () => {
    const token = await generateAccessToken(
      TEST_USER_ID,
      "CUSTOMER",
      TEST_SECRET,
    );
    await expect(
      verifyAccessToken(token, "wrong-secret-key-that-is-long-enough"),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });
});

// ---------------------------------------------------------------------------
// Refresh token tests
// ---------------------------------------------------------------------------

describe("generateRefreshToken / verifyRefreshToken", () => {
  it("generates a UUID token and verifies it successfully", async () => {
    const db = createRefreshTokenD1Mock();
    const token = await generateRefreshToken(TEST_USER_ID, db);

    expect(typeof token).toBe("string");
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const userId = await verifyRefreshToken(token, db);
    expect(userId).toBe(TEST_USER_ID);
  });

  it("throws INVALID_REFRESH_TOKEN for an unknown token", async () => {
    const db = createRefreshTokenD1Mock();
    await expect(
      verifyRefreshToken("unknown-token-abc", db),
    ).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN" });
  });
});

describe("invalidateRefreshToken", () => {
  it("invalidated token can no longer be verified", async () => {
    const db = createRefreshTokenD1Mock();
    const token = await generateRefreshToken(TEST_USER_ID, db);

    await invalidateRefreshToken(token, db);

    await expect(verifyRefreshToken(token, db)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("only invalidates the targeted token, not others", async () => {
    const db = createRefreshTokenD1Mock();
    const token1 = await generateRefreshToken(TEST_USER_ID, db);
    const token2 = await generateRefreshToken(TEST_USER_ID, db);

    await invalidateRefreshToken(token1, db);

    // token2 should still be valid
    const userId = await verifyRefreshToken(token2, db);
    expect(userId).toBe(TEST_USER_ID);
  });
});

describe("invalidateAllRefreshTokens", () => {
  it("invalidates every token belonging to the user", async () => {
    const db = createRefreshTokenD1Mock();
    const token1 = await generateRefreshToken(TEST_USER_ID, db);
    const token2 = await generateRefreshToken(TEST_USER_ID, db);

    await invalidateAllRefreshTokens(TEST_USER_ID, db);

    await expect(verifyRefreshToken(token1, db)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
    await expect(verifyRefreshToken(token2, db)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });
});
