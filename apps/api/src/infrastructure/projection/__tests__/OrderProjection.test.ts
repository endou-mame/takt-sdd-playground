import { describe, it, expect, beforeEach } from "vitest";
import { OrderProjection } from "../OrderProjection";
import { createD1MockHandle, type D1MockHandle } from "../../repository/__tests__/d1MockFactory";
import type { OrderEvent } from "../../../domain/order/OrderEvents";

const baseOrderCreated: OrderEvent = {
  type: "OrderCreated",
  orderId: "order-1",
  customerId: "user-1",
  items: [
    { productId: "prod-1", productName: "Widget", unitPrice: 1000, quantity: 2, subtotal: 2000 },
  ],
  shippingAddress: {
    postalCode: "100-0001",
    prefecture: "Tokyo",
    city: "Chiyoda",
    street: "1-1",
    recipientName: "Test User",
    phone: "090-0000-0001",
  },
  paymentMethod: "CREDIT_CARD",
  subtotal: 2000,
  shippingFee: 500,
  total: 2500,
};

describe("OrderProjection", () => {
  let handle: D1MockHandle;
  let projection: OrderProjection;

  beforeEach(() => {
    handle = createD1MockHandle();
    projection = new OrderProjection(handle.d1);
  });

  describe("OrderCreated", () => {
    it("issues an INSERT query", async () => {
      await projection.apply(baseOrderCreated);
      const insertCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("insert"));
      expect(insertCall).toBeDefined();
    });
  });

  describe("PaymentCompleted", () => {
    it("issues an UPDATE query", async () => {
      const event: OrderEvent = {
        type: "PaymentCompleted",
        orderId: "order-1",
        paymentMethod: "CREDIT_CARD",
        transactionId: "txn-1",
      };
      await projection.apply(event);
      const updateCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("update"));
      expect(updateCall).toBeDefined();
    });
  });

  describe("ConvenienceStorePaymentIssued", () => {
    it("issues an UPDATE query", async () => {
      const event: OrderEvent = {
        type: "ConvenienceStorePaymentIssued",
        orderId: "order-1",
        paymentCode: "1234567890",
        expiresAt: "2024-01-04T00:00:00.000Z",
      };
      await projection.apply(event);
      const updateCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("update"));
      expect(updateCall).toBeDefined();
    });
  });

  describe("OrderShipped", () => {
    it("issues an UPDATE query", async () => {
      const event: OrderEvent = { type: "OrderShipped", orderId: "order-1" };
      await projection.apply(event);
      const updateCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("update"));
      expect(updateCall).toBeDefined();
    });
  });

  describe("OrderCompleted", () => {
    it("issues an UPDATE query", async () => {
      const event: OrderEvent = { type: "OrderCompleted", orderId: "order-1" };
      await projection.apply(event);
      const updateCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("update"));
      expect(updateCall).toBeDefined();
    });
  });

  describe("OrderCancelled", () => {
    it("issues an UPDATE query", async () => {
      const event: OrderEvent = {
        type: "OrderCancelled",
        orderId: "order-1",
        reason: "Customer request",
      };
      await projection.apply(event);
      const updateCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("update"));
      expect(updateCall).toBeDefined();
    });
  });

  describe("RefundCompleted", () => {
    it("issues no DB queries (no-op)", async () => {
      const event: OrderEvent = { type: "RefundCompleted", orderId: "order-1", amount: 2500 };
      await projection.apply(event);
      expect(handle.calls).toHaveLength(0);
    });
  });
});
