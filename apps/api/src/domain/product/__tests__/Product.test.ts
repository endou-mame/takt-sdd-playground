import { describe, it, expect } from "vitest";
import type { CategoryId, Price, ProductId, StockCount } from "../../shared/ValueObjects";
import {
  createProduct,
  deleteProduct,
  updateStock,
  associateImage,
} from "../Product";

const PRODUCT_ID = "550e8400-e29b-41d4-a716-446655440000" as ProductId;
const CATEGORY_ID = "550e8400-e29b-41d4-a716-446655440001" as CategoryId;
const PRICE = 1000 as Price;

function makeProduct(stock: number = 5) {
  return createProduct({
    id: PRODUCT_ID,
    name: "Test Product",
    description: "A test product",
    price: PRICE,
    categoryId: CATEGORY_ID,
    stock: stock as StockCount,
  });
}

// ---------------------------------------------------------------------------
// createProduct
// ---------------------------------------------------------------------------

describe("createProduct", () => {
  it("sets stockStatus to IN_STOCK when stock > 0", () => {
    const product = makeProduct(1);
    expect(product.stockStatus).toBe("IN_STOCK");
  });

  it("sets stockStatus to OUT_OF_STOCK when stock = 0 (boundary)", () => {
    const product = makeProduct(0);
    expect(product.stockStatus).toBe("OUT_OF_STOCK");
  });

  it("sets initial status to PUBLISHED", () => {
    const product = makeProduct();
    expect(product.status).toBe("PUBLISHED");
  });

  it("initializes imageUrls as empty array", () => {
    const product = makeProduct();
    expect(product.imageUrls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deleteProduct
// ---------------------------------------------------------------------------

describe("deleteProduct", () => {
  it("sets status to UNPUBLISHED", () => {
    const product = makeProduct();
    const deleted = deleteProduct(product);
    expect(deleted.status).toBe("UNPUBLISHED");
  });

  it("does not change other fields", () => {
    const product = makeProduct(3);
    const deleted = deleteProduct(product);
    expect(deleted.id).toBe(product.id);
    expect(deleted.name).toBe(product.name);
    expect(deleted.price).toBe(product.price);
    expect(deleted.stock).toBe(product.stock);
    expect(deleted.stockStatus).toBe(product.stockStatus);
  });
});

// ---------------------------------------------------------------------------
// updateStock
// ---------------------------------------------------------------------------

describe("updateStock", () => {
  it("sets stockStatus to IN_STOCK when new stock > 0", () => {
    const product = makeProduct(0);
    const updated = updateStock(product, 10 as StockCount);
    expect(updated.stockStatus).toBe("IN_STOCK");
    expect(updated.stock).toBe(10);
  });

  it("sets stockStatus to OUT_OF_STOCK when new stock = 0 (boundary)", () => {
    const product = makeProduct(5);
    const updated = updateStock(product, 0 as StockCount);
    expect(updated.stockStatus).toBe("OUT_OF_STOCK");
    expect(updated.stock).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// associateImage
// ---------------------------------------------------------------------------

describe("associateImage", () => {
  it("adds image when count is below the limit (9th image succeeds)", () => {
    let product = makeProduct();
    for (let i = 0; i < 9; i++) {
      product = associateImage(product, `https://example.com/image-${i}.jpg`);
    }
    expect(product.imageUrls).toHaveLength(9);
  });

  it("throws IMAGE_LIMIT_EXCEEDED when adding beyond 10 images (boundary)", () => {
    let product = makeProduct();
    for (let i = 0; i < 10; i++) {
      product = associateImage(product, `https://example.com/image-${i}.jpg`);
    }
    expect(() =>
      associateImage(product, "https://example.com/extra.jpg"),
    ).toThrow("IMAGE_LIMIT_EXCEEDED");
  });
});
