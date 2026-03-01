import { describe, it, expect, beforeEach } from "vitest";
import { DrizzleProductRepository } from "../DrizzleProductRepository";
import { createD1MockHandle, type D1MockHandle } from "./d1MockFactory";

// productsRm column order from schema.ts:
// id, name, description, price, categoryId, stock, stockStatus, status, imageUrls, createdAt, updatedAt
function productRow(overrides: Partial<{
  id: string; name: string; description: string; price: number;
  categoryId: string; stock: number; stockStatus: string; status: string;
  imageUrls: string; createdAt: string; updatedAt: string;
}> = {}): unknown[] {
  return [
    overrides.id ?? "prod-1",
    overrides.name ?? "Test Product",
    overrides.description ?? "A test product",
    overrides.price ?? 1000,
    overrides.categoryId ?? "cat-1",
    overrides.stock ?? 10,
    overrides.stockStatus ?? "IN_STOCK",
    overrides.status ?? "PUBLISHED",
    overrides.imageUrls ?? '["https://example.com/img.jpg"]',
    overrides.createdAt ?? "2024-01-01T00:00:00.000Z",
    overrides.updatedAt ?? "2024-01-01T00:00:00.000Z",
  ];
}

describe("DrizzleProductRepository", () => {
  let handle: D1MockHandle;
  let repo: DrizzleProductRepository;

  beforeEach(() => {
    handle = createD1MockHandle();
    repo = new DrizzleProductRepository(handle.d1);
  });

  describe("getProductById()", () => {
    it("returns null when no row is found", async () => {
      handle.setConfig({ rawRows: [] });
      const result = await repo.getProductById("nonexistent");
      expect(result).toBeNull();
    });

    it("maps DB row to ProductRow and parses imageUrls JSON", async () => {
      handle.setConfig({
        rawRows: [
          productRow({
            id: "prod-42",
            imageUrls: '["https://cdn.example.com/a.jpg","https://cdn.example.com/b.jpg"]',
          }),
        ],
      });

      const result = await repo.getProductById("prod-42");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("prod-42");
      expect(result?.name).toBe("Test Product");
      expect(result?.price).toBe(1000);
      expect(result?.imageUrls).toEqual([
        "https://cdn.example.com/a.jpg",
        "https://cdn.example.com/b.jpg",
      ]);
    });

    it("parses empty imageUrls array correctly", async () => {
      handle.setConfig({ rawRows: [productRow({ imageUrls: "[]" })] });
      const result = await repo.getProductById("prod-1");
      expect(result?.imageUrls).toEqual([]);
    });

    it("maps all scalar fields correctly", async () => {
      handle.setConfig({
        rawRows: [productRow({ stock: 5, stockStatus: "OUT_OF_STOCK", status: "PUBLISHED" })],
      });
      const result = await repo.getProductById("prod-1");
      expect(result?.stock).toBe(5);
      expect(result?.stockStatus).toBe("OUT_OF_STOCK");
      expect(result?.status).toBe("PUBLISHED");
    });
  });

  describe("listProducts()", () => {
    it("returns items and total from DB", async () => {
      handle.setConfig({
        rawRows: [productRow({ id: "p1" }), productRow({ id: "p2" })],
        countValue: 2,
      });

      const { items, total } = await repo.listProducts({});
      expect(items).toHaveLength(2);
      expect(total).toBe(2);
    });

    it("returns empty items when DB has no matching rows", async () => {
      handle.setConfig({ rawRows: [], countValue: 0 });
      const { items, total } = await repo.listProducts({ keyword: "xyz" });
      expect(items).toHaveLength(0);
      expect(total).toBe(0);
    });

    it("executes a SELECT query to the DB", async () => {
      handle.setConfig({ rawRows: [], countValue: 0 });
      await repo.listProducts({});
      const selectCall = handle.calls.find((c) =>
        c.sql.toLowerCase().startsWith("select"),
      );
      expect(selectCall).toBeDefined();
    });

    it("maps rows including JSON-parsed imageUrls", async () => {
      handle.setConfig({
        rawRows: [productRow({ id: "p1", imageUrls: '["url1","url2"]' })],
        countValue: 1,
      });

      const { items } = await repo.listProducts({});
      expect(items[0]?.imageUrls).toEqual(["url1", "url2"]);
    });
  });
});
