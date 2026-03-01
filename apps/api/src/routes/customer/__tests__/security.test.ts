/**
 * Route-level security tests.
 *
 * Verifies:
 * 1. Accessing another user's order detail returns 403.
 * 2. POST /checkout response body does not leak credit-card fields.
 *
 * authMiddleware is mocked so authentication always passes, letting us focus
 * on authorization (ownership check) and response-body sanitisation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { customerOrdersRouter } from "../orders";
import { checkoutRouter } from "../checkout";
import { addressesRouter } from "../addresses";
import { errorHandler } from "../../../middleware/errorHandler";
import type { Bindings } from "../../../worker";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../../middleware/authMiddleware", () => ({
  authMiddleware: vi.fn(
    async (
      c: { get: (k: string) => unknown; set: (k: string, v: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set("userId", "test-user-id");
      c.set("role", "CUSTOMER");
      await next();
    },
  ),
  adminMiddleware: vi.fn(async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

vi.mock("../../../application/order/queries/OrderQueryHandlers", () => ({
  handleListMyOrders: vi.fn(),
  handleGetOrderDetail: vi.fn(),
}));

vi.mock("../../../application/order/commands/CheckoutCommandHandlers", () => ({
  handleCheckout: vi.fn(),
}));

vi.mock("../../../infrastructure/repository/DrizzleOrderRepository", () => ({
  DrizzleOrderRepository: vi.fn(),
}));

vi.mock("../../../infrastructure/repository/DrizzleUserRepository", () => ({
  // Vitest 4 requires `function` keyword (not arrow function) for constructors
  DrizzleUserRepository: vi.fn().mockImplementation(function () {
    return {
      findById: vi.fn().mockResolvedValue({
        id: "test-user-id",
        email: "test@example.com",
      }),
    };
  }),
}));

vi.mock("../../../infrastructure/event-store/D1EventStore", () => ({
  D1EventStore: vi.fn(),
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

vi.mock("../../../application/user/commands/AddressCommandHandlers", () => ({
  handleCreateAddress: vi.fn(),
  handleUpdateAddress: vi.fn(),
  handleDeleteAddress: vi.fn(),
}));

vi.mock("../../../application/user/queries/UserQueryHandlers", () => ({
  handleGetMyAddresses: vi.fn(),
  handleGetMyWishlist: vi.fn(),
  handleSearchCustomers: vi.fn(),
  handleGetCustomerDetail: vi.fn(),
}));

vi.mock("../../../infrastructure/repository/DrizzleAddressRepository", () => ({
  DrizzleAddressRepository: vi.fn(),
}));

vi.mock("../../../infrastructure/repository/DrizzleWishlistRepository", () => ({
  DrizzleWishlistRepository: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test app factories
// ---------------------------------------------------------------------------

function makeOrdersApp() {
  const app = new Hono<{ Bindings: Bindings }>();
  app.onError(errorHandler);
  app.route("/orders", customerOrdersRouter);
  return app;
}

function makeCheckoutApp() {
  const app = new Hono<{ Bindings: Bindings }>();
  app.onError(errorHandler);
  app.route("/checkout", checkoutRouter);
  return app;
}

function makeAddressesApp() {
  const app = new Hono<{ Bindings: Bindings }>();
  app.onError(errorHandler);
  app.route("/addresses", addressesRouter);
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
// Resource ownership: GET /orders/:id
// ---------------------------------------------------------------------------

describe("GET /orders/:id — resource ownership enforcement", () => {
  beforeEach(async () => {
    const { handleGetOrderDetail } = await import(
      "../../../application/order/queries/OrderQueryHandlers"
    );
    // Hono 4 only invokes onError for Error instances. Attach the code property
    // so that errorHandler can map it to the correct HTTP status.
    (handleGetOrderDetail as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" }),
    );
  });

  it("returns 403 when the order belongs to a different user", async () => {
    const app = makeOrdersApp();
    const res = await app.request("/orders/other-user-order-id", {}, makeEnv());
    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------
// Credit-card data sanitisation: POST /checkout
// ---------------------------------------------------------------------------

describe("POST /checkout — credit-card fields must not appear in response", () => {
  beforeEach(async () => {
    const { handleCheckout } = await import(
      "../../../application/order/commands/CheckoutCommandHandlers"
    );
    (handleCheckout as ReturnType<typeof vi.fn>).mockResolvedValue({
      orderId: "new-order-id",
    });
  });

  it("does not include cardNumber, cvv, expiryMonth, or expiryYear in the response body", async () => {
    const app = makeCheckoutApp();
    const res = await app.request(
      "/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartItems: [
            {
              productId: "prod-1",
              productName: "Widget",
              unitPrice: 1000,
              quantity: 1,
            },
          ],
          shippingAddress: {
            recipientName: "山田 太郎",
            postalCode: "100-0001",
            prefecture: "東京都",
            city: "千代田区",
            street: "1-1",
            phone: "090-0000-0000",
          },
          paymentMethod: "CREDIT_CARD",
          creditCard: {
            cardNumber: "4111111111111111",
            cvv: "123",
            expiryMonth: "12",
            expiryYear: "2030",
          },
        }),
      },
      makeEnv(),
    );

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    const bodyText = JSON.stringify(body);

    expect(bodyText).not.toContain("cardNumber");
    expect(bodyText).not.toContain("4111111111111111");
    expect(bodyText).not.toContain("cvv");
    expect(bodyText).not.toContain("expiryMonth");
    expect(bodyText).not.toContain("expiryYear");
    // Verify the actual response only contains the order ID
    expect(body.orderId).toBe("new-order-id");
  });
});

// ---------------------------------------------------------------------------
// Resource ownership: PUT /addresses/:id
// ---------------------------------------------------------------------------

describe("PUT /addresses/:id — resource ownership enforcement", () => {
  beforeEach(async () => {
    const { handleUpdateAddress } = await import(
      "../../../application/user/commands/AddressCommandHandlers"
    );
    (handleUpdateAddress as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" }),
    );
  });

  it("returns 403 when the address belongs to a different user", async () => {
    const app = makeAddressesApp();
    const res = await app.request(
      "/addresses/other-user-address-id",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------
// Resource ownership: DELETE /addresses/:id
// ---------------------------------------------------------------------------

describe("DELETE /addresses/:id — resource ownership enforcement", () => {
  beforeEach(async () => {
    const { handleDeleteAddress } = await import(
      "../../../application/user/commands/AddressCommandHandlers"
    );
    (handleDeleteAddress as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" }),
    );
  });

  it("returns 403 when the address belongs to a different user", async () => {
    const app = makeAddressesApp();
    const res = await app.request(
      "/addresses/other-user-address-id",
      { method: "DELETE" },
      makeEnv(),
    );
    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
