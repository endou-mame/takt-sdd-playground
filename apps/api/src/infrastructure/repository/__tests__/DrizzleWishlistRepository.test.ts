import { describe, it, expect, beforeEach } from "vitest";
import { DrizzleWishlistRepository } from "../DrizzleWishlistRepository";
import { createD1MockHandle, type D1MockHandle } from "./d1MockFactory";

// wishlists column order from schema.ts: id, userId, productId, createdAt
function wishlistRow(overrides: Partial<{
  id: string; userId: string; productId: string; createdAt: string;
}> = {}): unknown[] {
  return [
    overrides.id ?? "wl-1",
    overrides.userId ?? "user-1",
    overrides.productId ?? "prod-1",
    overrides.createdAt ?? "2024-01-01T00:00:00.000Z",
  ];
}

describe("DrizzleWishlistRepository", () => {
  let handle: D1MockHandle;
  let repo: DrizzleWishlistRepository;

  beforeEach(() => {
    handle = createD1MockHandle();
    repo = new DrizzleWishlistRepository(handle.d1);
  });

  describe("listByUser()", () => {
    it("returns empty array when user has no wishlist items", async () => {
      handle.setConfig({ rawRows: [] });
      const result = await repo.listByUser("user-1");
      expect(result).toEqual([]);
    });

    it("maps rows to WishlistItem", async () => {
      handle.setConfig({
        rawRows: [
          wishlistRow({ id: "wl-1", productId: "prod-1" }),
          wishlistRow({ id: "wl-2", productId: "prod-2" }),
        ],
      });

      const result = await repo.listByUser("user-1");
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe("wl-1");
      expect(result[0]?.productId).toBe("prod-1");
      expect(result[1]?.productId).toBe("prod-2");
    });
  });

  describe("exists()", () => {
    it("returns false when item does not exist", async () => {
      handle.setConfig({ rawRows: [] });
      const result = await repo.exists("user-1", "prod-1");
      expect(result).toBe(false);
    });

    it("returns true when item exists", async () => {
      handle.setConfig({ rawRows: [["wl-1"]] });
      const result = await repo.exists("user-1", "prod-1");
      expect(result).toBe(true);
    });
  });

  describe("add()", () => {
    it("executes INSERT without error", async () => {
      await expect(
        repo.add("user-1", "prod-1", "wl-new", "2024-01-01T00:00:00.000Z"),
      ).resolves.toBeUndefined();

      const insertCall = handle.calls.find((c) =>
        c.sql.toLowerCase().startsWith("insert"),
      );
      expect(insertCall).toBeDefined();
    });

    it("throws WISHLIST_DUPLICATE when UNIQUE constraint fails", async () => {
      handle.setConfig({
        insertError: new Error(
          "UNIQUE constraint failed: wishlists.user_id, wishlists.product_id",
        ),
      });

      await expect(
        repo.add("user-1", "prod-1", "wl-dup", "2024-01-01T00:00:00.000Z"),
      ).rejects.toMatchObject({ code: "WISHLIST_DUPLICATE" });
    });

    it("re-throws non-UNIQUE errors as Error (Drizzle wraps in DrizzleQueryError)", async () => {
      // Drizzle ORM wraps the raw D1 error in DrizzleQueryError before our
      // catch block sees it, so the thrown value is a DrizzleQueryError — not
      // the original Error. We verify it is NOT a WISHLIST_DUPLICATE code.
      handle.setConfig({ insertError: new Error("D1 connection error") });

      await expect(
        repo.add("user-1", "prod-1", "wl-1", "2024-01-01T00:00:00.000Z"),
      ).rejects.toSatisfy(
        (e: unknown) => e instanceof Error && !("code" in (e as object)),
      );
    });
  });

  describe("remove()", () => {
    it("executes DELETE without error", async () => {
      await expect(repo.remove("user-1", "prod-1")).resolves.toBeUndefined();
      const deleteCall = handle.calls.find((c) =>
        c.sql.toLowerCase().startsWith("delete"),
      );
      expect(deleteCall).toBeDefined();
    });
  });
});
