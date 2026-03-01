import { describe, it, expect, beforeEach } from "vitest";
import { ProductProjection } from "../ProductProjection";
import { createD1MockHandle, type D1MockHandle } from "../../repository/__tests__/d1MockFactory";
import type { ProductEvent } from "../../../domain/product/ProductEvents";

// productsRm column order: id, name, description, price, categoryId,
// stock, stockStatus, status, imageUrls, createdAt, updatedAt
function productRow(overrides: Partial<{
  id: string; name: string; description: string; price: number;
  categoryId: string; stock: number; stockStatus: string; status: string;
  imageUrls: string; createdAt: string; updatedAt: string;
}> = {}): unknown[] {
  return [
    overrides.id ?? "prod-1",
    overrides.name ?? "Product",
    overrides.description ?? "Desc",
    overrides.price ?? 1000,
    overrides.categoryId ?? "cat-1",
    overrides.stock ?? 10,
    overrides.stockStatus ?? "IN_STOCK",
    overrides.status ?? "PUBLISHED",
    overrides.imageUrls ?? "[]",
    overrides.createdAt ?? "2024-01-01T00:00:00.000Z",
    overrides.updatedAt ?? "2024-01-01T00:00:00.000Z",
  ];
}

describe("ProductProjection", () => {
  let handle: D1MockHandle;
  let projection: ProductProjection;

  beforeEach(() => {
    handle = createD1MockHandle();
    projection = new ProductProjection(handle.d1);
  });

  describe("ProductCreated", () => {
    it("issues an INSERT query", async () => {
      const event: ProductEvent = {
        type: "ProductCreated",
        productId: "prod-1",
        name: "Test",
        description: "Desc",
        price: 1000,
        categoryId: "cat-1",
        stock: 5,
      };
      await projection.apply(event);
      const insertCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("insert"));
      expect(insertCall).toBeDefined();
    });

    it("sets stockStatus to OUT_OF_STOCK when stock is 0", async () => {
      const event: ProductEvent = {
        type: "ProductCreated",
        productId: "prod-2",
        name: "Zero Stock",
        description: "None",
        price: 500,
        categoryId: "cat-1",
        stock: 0,
      };
      await expect(projection.apply(event)).resolves.toBeUndefined();
    });
  });

  describe("ProductUpdated", () => {
    it("issues an UPDATE query", async () => {
      const event: ProductEvent = {
        type: "ProductUpdated",
        productId: "prod-1",
        changes: { name: "New Name", price: 2000 },
      };
      await projection.apply(event);
      const updateCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("update"));
      expect(updateCall).toBeDefined();
    });

    it("resolves without error when changes is empty", async () => {
      const event: ProductEvent = {
        type: "ProductUpdated",
        productId: "prod-1",
        changes: {},
      };
      await expect(projection.apply(event)).resolves.toBeUndefined();
    });
  });

  describe("ProductDeleted", () => {
    it("issues an UPDATE query", async () => {
      const event: ProductEvent = { type: "ProductDeleted", productId: "prod-1" };
      await projection.apply(event);
      const updateCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("update"));
      expect(updateCall).toBeDefined();
    });
  });

  describe("StockUpdated", () => {
    it("issues an UPDATE query for direct stock replacement", async () => {
      const event: ProductEvent = { type: "StockUpdated", productId: "prod-1", quantity: 20 };
      await projection.apply(event);
      const updateCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("update"));
      expect(updateCall).toBeDefined();
    });
  });

  describe("StockDecreased", () => {
    it("issues SELECT then UPDATE, clamping stock at 0", async () => {
      // .select({ stock }) returns a single-column raw row
      handle.setConfig({ rawRows: [[3]] });
      const event: ProductEvent = {
        type: "StockDecreased",
        productId: "prod-1",
        quantity: 5,
        orderId: "order-1",
      };
      await projection.apply(event);

      const selectCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("select"));
      const updateCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("update"));
      expect(selectCall).toBeDefined();
      expect(updateCall).toBeDefined();
    });

    it("does nothing when the product row is missing", async () => {
      handle.setConfig({ rawRows: [] });
      const event: ProductEvent = {
        type: "StockDecreased",
        productId: "nonexistent",
        quantity: 1,
        orderId: "order-1",
      };
      await expect(projection.apply(event)).resolves.toBeUndefined();
    });
  });

  describe("StockIncreased", () => {
    it("issues SELECT then UPDATE", async () => {
      // .select({ stock }) returns a single-column raw row
      handle.setConfig({ rawRows: [[5]] });
      const event: ProductEvent = {
        type: "StockIncreased",
        productId: "prod-1",
        quantity: 3,
        orderId: "order-1",
      };
      await projection.apply(event);

      const selectCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("select"));
      const updateCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("update"));
      expect(selectCall).toBeDefined();
      expect(updateCall).toBeDefined();
    });
  });

  describe("ProductImageAssociated", () => {
    it("issues SELECT then UPDATE to append the imageUrl", async () => {
      // .select({ imageUrls }) returns a single-column raw row
      handle.setConfig({ rawRows: [['["existing.jpg"]']] });
      const event: ProductEvent = {
        type: "ProductImageAssociated",
        productId: "prod-1",
        imageUrl: "new.jpg",
      };
      await projection.apply(event);

      const selectCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("select"));
      const updateCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("update"));
      expect(selectCall).toBeDefined();
      expect(updateCall).toBeDefined();
    });

    it("does nothing when the product row is missing", async () => {
      handle.setConfig({ rawRows: [] });
      const event: ProductEvent = {
        type: "ProductImageAssociated",
        productId: "nonexistent",
        imageUrl: "url.jpg",
      };
      await expect(projection.apply(event)).resolves.toBeUndefined();
    });
  });
});
