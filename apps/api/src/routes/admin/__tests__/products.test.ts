import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { adminProductsRouter } from "../products";
import type { Bindings } from "../../../worker";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../../application/product/commands/ProductCommandHandlers", () => ({
  handleCreateProduct: vi.fn(),
  handleUpdateProduct: vi.fn(),
  handleDeleteProduct: vi.fn(),
}));

vi.mock("../../../application/product/commands/StockCommandHandlers", () => ({
  handleUpdateStock: vi.fn(),
}));

vi.mock("../../../infrastructure/event-store/D1EventStore", () => ({
  D1EventStore: vi.fn(),
}));
vi.mock("../../../infrastructure/projection/ProductProjection", () => ({
  ProductProjection: vi.fn(),
}));

vi.mock("../../../middleware/authMiddleware", () => ({
  authMiddleware: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("userId", "admin-user-id");
    c.set("role", "ADMIN");
    await next();
  }),
  adminMiddleware: vi.fn(async (_c: unknown, next: () => Promise<void>) => { await next(); }),
}));

// ---------------------------------------------------------------------------
// Test app with error handler
// ---------------------------------------------------------------------------

function makeApp() {
  const app = new Hono<{ Bindings: Bindings }>();
  app.onError((err, c) => {
    const e = err as { code?: string; fields?: string[] };
    const statusMap: Record<string, number> = {
      VALIDATION_ERROR: 400,
      PRODUCT_NOT_FOUND: 404,
      FORBIDDEN: 403,
    };
    const status = (statusMap[e.code ?? ""] ?? 500) as 400 | 403 | 404 | 500;
    return c.json({ error: { code: e.code ?? "UNKNOWN", message: "", fields: e.fields ?? [] } }, status);
  });
  app.route("/admin", adminProductsRouter);
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
// POST /admin/products
// ---------------------------------------------------------------------------

describe("POST /admin/products", () => {
  beforeEach(async () => {
    const { handleCreateProduct } = await import("../../../application/product/commands/ProductCommandHandlers");
    (handleCreateProduct as ReturnType<typeof vi.fn>).mockResolvedValue({ productId: "prod-1" });
  });

  it("returns 201 with productId on valid input", async () => {
    const app = makeApp();
    const res = await app.request(
      "/admin/products",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Product A",
          description: "Description",
          price: 1000,
          categoryId: "cat-1",
          stock: 10,
        }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { productId: string };
    expect(body.productId).toBe("prod-1");
  });

  it("returns 400 when required fields are missing", async () => {
    const app = makeApp();
    const res = await app.request(
      "/admin/products",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Product A" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
// PUT /admin/products/:id
// ---------------------------------------------------------------------------

describe("PUT /admin/products/:id", () => {
  it("returns 200 on successful update", async () => {
    const { handleUpdateProduct } = await import("../../../application/product/commands/ProductCommandHandlers");
    (handleUpdateProduct as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = makeApp();
    const res = await app.request(
      "/admin/products/prod-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Name", price: 2000 }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// DELETE /admin/products/:id
// ---------------------------------------------------------------------------

describe("DELETE /admin/products/:id", () => {
  it("returns 200 on successful delete", async () => {
    const { handleDeleteProduct } = await import("../../../application/product/commands/ProductCommandHandlers");
    (handleDeleteProduct as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = makeApp();
    const res = await app.request(
      "/admin/products/prod-1",
      { method: "DELETE" },
      makeEnv(),
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// PUT /admin/products/:id/stock
// ---------------------------------------------------------------------------

describe("PUT /admin/products/:id/stock", () => {
  it("returns 200 on valid stock update", async () => {
    const { handleUpdateStock } = await import("../../../application/product/commands/StockCommandHandlers");
    (handleUpdateStock as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = makeApp();
    const res = await app.request(
      "/admin/products/prod-1/stock",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: 50 }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 when quantity is missing", async () => {
    const app = makeApp();
    const res = await app.request(
      "/admin/products/prod-1/stock",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });
});
