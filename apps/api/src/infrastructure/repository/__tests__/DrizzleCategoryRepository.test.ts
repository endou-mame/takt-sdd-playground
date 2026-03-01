import { describe, it, expect, beforeEach } from "vitest";
import { DrizzleCategoryRepository } from "../DrizzleCategoryRepository";
import { createD1MockHandle, type D1MockHandle } from "./d1MockFactory";

// categoriesRm column order from schema.ts: id, name, createdAt
function categoryRow(overrides: Partial<{
  id: string; name: string; createdAt: string;
}> = {}): unknown[] {
  return [
    overrides.id ?? "cat-1",
    overrides.name ?? "Electronics",
    overrides.createdAt ?? "2024-01-01T00:00:00.000Z",
  ];
}

describe("DrizzleCategoryRepository", () => {
  let handle: D1MockHandle;
  let repo: DrizzleCategoryRepository;

  beforeEach(() => {
    handle = createD1MockHandle();
    repo = new DrizzleCategoryRepository(handle.d1);
  });

  describe("listCategories()", () => {
    it("returns empty array when no categories exist", async () => {
      handle.setConfig({ rawRows: [] });
      const result = await repo.listCategories();
      expect(result).toEqual([]);
    });

    it("maps DB rows to CategoryRow objects", async () => {
      handle.setConfig({
        rawRows: [
          categoryRow({ id: "cat-1", name: "Electronics" }),
          categoryRow({ id: "cat-2", name: "Books" }),
        ],
      });

      const result = await repo.listCategories();
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe("cat-1");
      expect(result[0]?.name).toBe("Electronics");
      expect(result[1]?.id).toBe("cat-2");
      expect(result[1]?.name).toBe("Books");
    });
  });

  describe("existsByName()", () => {
    it("returns false when no category with that name exists", async () => {
      handle.setConfig({ rawRows: [] });
      const result = await repo.existsByName("Nonexistent");
      expect(result).toBe(false);
    });

    it("returns true when a category with that name exists", async () => {
      handle.setConfig({ rawRows: [categoryRow({ id: "cat-1" })] });
      const result = await repo.existsByName("Electronics");
      expect(result).toBe(true);
    });
  });

  describe("hasProducts()", () => {
    it("returns false when count is 0", async () => {
      handle.setConfig({ countValue: 0 });
      const result = await repo.hasProducts("cat-1");
      expect(result).toBe(false);
    });

    it("returns true when count is greater than 0", async () => {
      handle.setConfig({ countValue: 3 });
      const result = await repo.hasProducts("cat-1");
      expect(result).toBe(true);
    });
  });

  describe("create()", () => {
    it("issues an INSERT query with the given id and name", async () => {
      await repo.create("cat-new", "New Category");
      const insertCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("insert"));
      expect(insertCall).toBeDefined();
    });

    it("resolves without error on success", async () => {
      await expect(repo.create("cat-new", "New Category")).resolves.toBeUndefined();
    });
  });

  describe("deleteById()", () => {
    it("issues a DELETE query for the given id", async () => {
      await repo.deleteById("cat-1");
      const deleteCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("delete"));
      expect(deleteCall).toBeDefined();
    });

    it("resolves without error on success", async () => {
      await expect(repo.deleteById("cat-1")).resolves.toBeUndefined();
    });
  });
});
