import { describe, it, expect, beforeEach } from "vitest";
import { DrizzleUserRepository } from "../DrizzleUserRepository";
import { createD1MockHandle, type D1MockHandle } from "./d1MockFactory";

// users column order from schema.ts:
// id, email, passwordHash, name, role, emailVerified, failedLoginAttempts,
// lockedUntil, createdAt, updatedAt
function userRow(overrides: Partial<{
  id: string; email: string; passwordHash: string; name: string;
  role: string; emailVerified: number; failedLoginAttempts: number;
  lockedUntil: string | null; createdAt: string; updatedAt: string;
}> = {}): unknown[] {
  return [
    overrides.id ?? "user-1",
    overrides.email ?? "user@example.com",
    overrides.passwordHash ?? "$2b$12$hash",
    overrides.name ?? "山田太郎",
    overrides.role ?? "CUSTOMER",
    overrides.emailVerified ?? 0,
    overrides.failedLoginAttempts ?? 0,
    overrides.lockedUntil ?? null,
    overrides.createdAt ?? "2024-01-01T00:00:00.000Z",
    overrides.updatedAt ?? "2024-01-01T00:00:00.000Z",
  ];
}

describe("DrizzleUserRepository", () => {
  let handle: D1MockHandle;
  let repo: DrizzleUserRepository;

  beforeEach(() => {
    handle = createD1MockHandle();
    repo = new DrizzleUserRepository(handle.d1);
  });

  describe("findByEmail()", () => {
    it("returns null when user not found", async () => {
      handle.setConfig({ rawRows: [] });
      const result = await repo.findByEmail("unknown@example.com");
      expect(result).toBeNull();
    });

    it("converts emailVerified INTEGER(1) to boolean true", async () => {
      handle.setConfig({ rawRows: [userRow({ emailVerified: 1 })] });
      const result = await repo.findByEmail("user@example.com");
      expect(result?.emailVerified).toBe(true);
    });

    it("converts emailVerified INTEGER(0) to boolean false", async () => {
      handle.setConfig({ rawRows: [userRow({ emailVerified: 0 })] });
      const result = await repo.findByEmail("user@example.com");
      expect(result?.emailVerified).toBe(false);
    });

    it("maps lockedUntil null correctly", async () => {
      handle.setConfig({ rawRows: [userRow({ lockedUntil: null })] });
      const result = await repo.findByEmail("user@example.com");
      expect(result?.lockedUntil).toBeNull();
    });

    it("maps lockedUntil ISO string correctly", async () => {
      const lockedAt = "2024-01-01T01:00:00.000Z";
      handle.setConfig({ rawRows: [userRow({ lockedUntil: lockedAt })] });
      const result = await repo.findByEmail("user@example.com");
      expect(result?.lockedUntil).toBe(lockedAt);
    });

    it("maps all fields to UserRecord", async () => {
      handle.setConfig({
        rawRows: [
          userRow({
            id: "user-42",
            email: "test@example.com",
            role: "ADMIN",
            failedLoginAttempts: 3,
          }),
        ],
      });
      const result = await repo.findByEmail("test@example.com");
      expect(result?.id).toBe("user-42");
      expect(result?.role).toBe("ADMIN");
      expect(result?.failedLoginAttempts).toBe(3);
    });
  });

  describe("findById()", () => {
    it("returns null when user not found", async () => {
      handle.setConfig({ rawRows: [] });
      const result = await repo.findById("nonexistent");
      expect(result).toBeNull();
    });

    it("returns UserRecord when user exists", async () => {
      handle.setConfig({ rawRows: [userRow({ id: "user-1" })] });
      const result = await repo.findById("user-1");
      expect(result?.id).toBe("user-1");
    });
  });

  describe("save()", () => {
    it("executes INSERT without error", async () => {
      await expect(
        repo.save({
          id: "user-new",
          email: "new@example.com",
          passwordHash: "$2b$12$hash",
          name: "新規ユーザー",
          role: "CUSTOMER",
          emailVerified: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        }),
      ).resolves.toBeUndefined();

      const insertCall = handle.calls.find((c) =>
        c.sql.toLowerCase().startsWith("insert"),
      );
      expect(insertCall).toBeDefined();
    });
  });

  describe("searchCustomers()", () => {
    it("returns empty array when no match", async () => {
      handle.setConfig({ rawRows: [] });
      const result = await repo.searchCustomers("nonexistent");
      expect(result).toEqual([]);
    });

    it("maps DB rows to CustomerSummary", async () => {
      // searchCustomers uses a partial select (id, email, name, role, createdAt)
      handle.setConfig({
        rawRows: [["user-1", "user@example.com", "山田太郎", "CUSTOMER", "2024-01-01T00:00:00.000Z"]],
      });
      const result = await repo.searchCustomers("山田");
      expect(result).toHaveLength(1);
      expect(result[0]?.email).toBe("user@example.com");
    });
  });

  describe("getCustomerDetail()", () => {
    it("returns null when user does not exist", async () => {
      handle.setConfig({ rawRows: [] });
      const result = await repo.getCustomerDetail("nonexistent");
      expect(result).toBeNull();
    });
  });
});
