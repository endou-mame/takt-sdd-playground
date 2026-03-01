import { describe, it, expect, beforeEach } from "vitest";
import { DrizzleAddressRepository } from "../DrizzleAddressRepository";
import { createD1MockHandle, type D1MockHandle } from "./d1MockFactory";

// addresses column order from schema.ts:
// id, userId, postalCode, prefecture, city, street, name, phone, createdAt
function addressRow(overrides: Partial<{
  id: string; userId: string; postalCode: string; prefecture: string;
  city: string; street: string; name: string; phone: string; createdAt: string;
}> = {}): unknown[] {
  return [
    overrides.id ?? "addr-1",
    overrides.userId ?? "user-1",
    overrides.postalCode ?? "100-0001",
    overrides.prefecture ?? "東京都",
    overrides.city ?? "千代田区",
    overrides.street ?? "1-1",
    overrides.name ?? "山田太郎",
    overrides.phone ?? "03-1234-5678",
    overrides.createdAt ?? "2024-01-01T00:00:00.000Z",
  ];
}

describe("DrizzleAddressRepository", () => {
  let handle: D1MockHandle;
  let repo: DrizzleAddressRepository;

  beforeEach(() => {
    handle = createD1MockHandle();
    repo = new DrizzleAddressRepository(handle.d1);
  });

  describe("listByUser()", () => {
    it("returns empty array when user has no addresses", async () => {
      handle.setConfig({ rawRows: [] });
      const result = await repo.listByUser("user-1");
      expect(result).toEqual([]);
    });

    it("maps rows to AddressRecord", async () => {
      handle.setConfig({
        rawRows: [
          addressRow({ id: "addr-1", userId: "user-1" }),
          addressRow({ id: "addr-2", userId: "user-1" }),
        ],
      });

      const result = await repo.listByUser("user-1");
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe("addr-1");
      expect(result[0]?.postalCode).toBe("100-0001");
      expect(result[1]?.id).toBe("addr-2");
    });
  });

  describe("findById()", () => {
    it("returns null when address does not exist", async () => {
      handle.setConfig({ rawRows: [] });
      const result = await repo.findById("nonexistent");
      expect(result).toBeNull();
    });

    it("maps DB row to AddressRecord", async () => {
      handle.setConfig({ rawRows: [addressRow({ id: "addr-42" })] });
      const result = await repo.findById("addr-42");
      expect(result?.id).toBe("addr-42");
      expect(result?.prefecture).toBe("東京都");
    });
  });

  describe("create()", () => {
    it("executes INSERT without error", async () => {
      await expect(
        repo.create({
          id: "addr-new",
          userId: "user-1",
          postalCode: "100-0001",
          prefecture: "東京都",
          city: "千代田区",
          street: "1-1",
          name: "山田太郎",
          phone: "03-1234-5678",
          createdAt: "2024-01-01T00:00:00.000Z",
        }),
      ).resolves.toBeUndefined();

      const insertCall = handle.calls.find((c) =>
        c.sql.toLowerCase().startsWith("insert"),
      );
      expect(insertCall).toBeDefined();
    });
  });

  describe("countByUser()", () => {
    it("returns 0 when user has no addresses", async () => {
      handle.setConfig({ countValue: 0 });
      const result = await repo.countByUser("user-1");
      expect(result).toBe(0);
    });

    it("returns count from DB", async () => {
      handle.setConfig({ countValue: 7 });
      const result = await repo.countByUser("user-1");
      expect(result).toBe(7);
    });
  });

  describe("delete()", () => {
    it("executes DELETE without error", async () => {
      await expect(repo.delete("addr-1", "user-1")).resolves.toBeUndefined();
      const deleteCall = handle.calls.find((c) =>
        c.sql.toLowerCase().startsWith("delete"),
      );
      expect(deleteCall).toBeDefined();
    });
  });
});
