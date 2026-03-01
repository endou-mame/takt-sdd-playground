import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { adminOrdersRouter } from "../orders";
import type { Bindings } from "../../../worker";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../../application/order/queries/OrderQueryHandlers", () => ({
  handleListAllOrders: vi.fn(),
  handleGetOrderDetail: vi.fn(),
}));

vi.mock("../../../application/order/commands/OrderStatusCommandHandlers", () => ({
  handleShipOrder: vi.fn(),
  handleCompleteOrder: vi.fn(),
}));

vi.mock("../../../application/order/commands/CancelRefundCommandHandlers", () => ({
  handleCancelOrder: vi.fn(),
  handleRefundOrder: vi.fn(),
}));

vi.mock("../../../infrastructure/event-store/D1EventStore", () => ({
  D1EventStore: vi.fn(),
}));
vi.mock("../../../infrastructure/repository/DrizzleOrderRepository", () => ({
  DrizzleOrderRepository: vi.fn(),
}));
vi.mock("../../../infrastructure/repository/DrizzleUserRepository", () => ({
  DrizzleUserRepository: vi.fn(),
}));
vi.mock("../../../infrastructure/projection/OrderProjection", () => ({
  OrderProjection: vi.fn(),
}));
vi.mock("../../../infrastructure/projection/ProductProjection", () => ({
  ProductProjection: vi.fn(),
}));
vi.mock("../../../infrastructure/payment/StripePaymentGateway", () => ({
  StripePaymentGateway: vi.fn(),
}));
vi.mock("../../../infrastructure/email/EmailQueueProducer", () => ({
  CloudflareEmailQueueProducer: vi.fn(),
}));
vi.mock("../../../infrastructure/email/EmailRetryRepository", () => ({
  EmailRetryRepository: vi.fn(),
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
// Test app
// ---------------------------------------------------------------------------

function makeApp() {
  const app = new Hono<{ Bindings: Bindings }>();
  app.onError((err, c) => {
    const e = err as { code?: string; fields?: string[] };
    const statusMap: Record<string, number> = { VALIDATION_ERROR: 400, ORDER_NOT_FOUND: 404 };
    const status = (statusMap[e.code ?? ""] ?? 500) as 400 | 404 | 500;
    return c.json({ error: { code: e.code ?? "UNKNOWN", message: "", fields: e.fields ?? [] } }, status);
  });
  app.route("/admin", adminOrdersRouter);
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
// GET /admin/orders
// ---------------------------------------------------------------------------

describe("GET /admin/orders", () => {
  beforeEach(async () => {
    const { handleListAllOrders } = await import("../../../application/order/queries/OrderQueryHandlers");
    (handleListAllOrders as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });
  });

  it("returns 200 with order list", async () => {
    const app = makeApp();
    const res = await app.request("/admin/orders", {}, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; total: number };
    expect(body.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PUT /admin/orders/:id/status
// ---------------------------------------------------------------------------

describe("PUT /admin/orders/:id/status", () => {
  beforeEach(async () => {
    const { handleShipOrder } = await import("../../../application/order/commands/OrderStatusCommandHandlers");
    (handleShipOrder as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { handleCompleteOrder } = await import("../../../application/order/commands/OrderStatusCommandHandlers");
    (handleCompleteOrder as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("calls handleShipOrder when status is SHIPPED", async () => {
    const { handleShipOrder } = await import("../../../application/order/commands/OrderStatusCommandHandlers");
    const app = makeApp();
    const res = await app.request(
      "/admin/orders/order-1/status",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SHIPPED" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(handleShipOrder).toHaveBeenCalledWith({ orderId: "order-1" }, expect.anything());
  });

  it("calls handleCompleteOrder when status is COMPLETED", async () => {
    const { handleCompleteOrder } = await import("../../../application/order/commands/OrderStatusCommandHandlers");
    const app = makeApp();
    await app.request(
      "/admin/orders/order-1/status",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      },
      makeEnv(),
    );
    expect(handleCompleteOrder).toHaveBeenCalledWith({ orderId: "order-1" }, expect.anything());
  });

  it("returns 400 when status is invalid", async () => {
    const app = makeApp();
    const res = await app.request(
      "/admin/orders/order-1/status",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "INVALID_STATUS" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /admin/orders/:id/cancel
// ---------------------------------------------------------------------------

describe("POST /admin/orders/:id/cancel", () => {
  it("calls handleCancelOrder with orderId and reason", async () => {
    const { handleCancelOrder } = await import("../../../application/order/commands/CancelRefundCommandHandlers");
    (handleCancelOrder as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = makeApp();
    const res = await app.request(
      "/admin/orders/order-1/cancel",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Customer request" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(handleCancelOrder).toHaveBeenCalledWith(
      { orderId: "order-1", reason: "Customer request" },
      expect.anything(),
    );
  });

  it("returns 400 when reason is missing", async () => {
    const app = makeApp();
    const res = await app.request(
      "/admin/orders/order-1/cancel",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });
});
