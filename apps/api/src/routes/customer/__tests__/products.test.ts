import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { productsPublicRouter } from "../products";
import type { Bindings } from "../../../worker";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../../application/product/queries/ProductQueryHandlers", () => ({
  handleListProducts: vi.fn(),
  handleGetProduct: vi.fn(),
  handleListCategories: vi.fn(),
}));

vi.mock("../../../infrastructure/repository/DrizzleProductRepository", () => ({
  DrizzleProductRepository: vi.fn(),
}));

vi.mock("../../../infrastructure/repository/DrizzleCategoryRepository", () => ({
  DrizzleCategoryRepository: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

function makeApp() {
  const app = new Hono<{ Bindings: Bindings }>();
  app.route("/", productsPublicRouter);
  return app;
}

function makeEnv(): Bindings {
  return {
    EVENTS_DB: {} as D1Database,
    IMAGE_BUCKET: {} as R2Bucket,
    CART_DO: {} as DurableObjectNamespace,
    EMAIL_QUEUE: {} as Queue,
    RESEND_API_KEY: "key",
    RESEND_FROM_ADDRESS: "no-reply@example.com",
    JWT_SECRET: "secret",
    APP_BASE_URL: "https://example.com",
    STRIPE_API_KEY: "stripe-key",
    R2_PUBLIC_URL: "https://pub.r2.dev",
  };
}

// ---------------------------------------------------------------------------
// GET /products
// ---------------------------------------------------------------------------

describe("GET /products", () => {
  beforeEach(async () => {
    const { handleListProducts } = await import("../../../application/product/queries/ProductQueryHandlers");
    (handleListProducts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });
  });

  it("returns 200 with items and total", async () => {
    const app = makeApp();
    const res = await app.request("/products", {}, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; total: number };
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("accepts filter query params", async () => {
    const { handleListProducts } = await import("../../../application/product/queries/ProductQueryHandlers");
    (handleListProducts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });

    const app = makeApp();
    const res = await app.request("/products?keyword=test&minPrice=100&maxPrice=1000", {}, makeEnv());
    expect(res.status).toBe(200);
    expect(handleListProducts).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: "test", minPrice: 100, maxPrice: 1000 }),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// GET /products/:id
// ---------------------------------------------------------------------------

describe("GET /products/:id", () => {
  it("returns 200 with product on found", async () => {
    const { handleGetProduct } = await import("../../../application/product/queries/ProductQueryHandlers");
    (handleGetProduct as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "product-1",
      name: "Test Product",
    });

    const app = makeApp();
    const res = await app.request("/products/product-1", {}, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string };
    expect(body.id).toBe("product-1");
  });
});

// ---------------------------------------------------------------------------
// GET /categories
// ---------------------------------------------------------------------------

describe("GET /categories", () => {
  it("returns 200 with categories list", async () => {
    const { handleListCategories } = await import("../../../application/product/queries/ProductQueryHandlers");
    (handleListCategories as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "cat-1", name: "Electronics" },
    ]);

    const app = makeApp();
    const res = await app.request("/categories", {}, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ id: string; name: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.name).toBe("Electronics");
  });
});
