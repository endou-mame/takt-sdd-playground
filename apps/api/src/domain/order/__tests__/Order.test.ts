import { describe, it, expect } from "vitest";
import type { OrderId, Price, ProductId, StockCount, UserId } from "../../shared/ValueObjects";
import type { OrderItem, ShippingAddress } from "../Order";
import {
  createOrder,
  shipOrder,
  completeOrder,
  cancelOrder,
  completeRefund,
} from "../Order";

const ORDER_ID = "550e8400-e29b-41d4-a716-446655440000" as OrderId;
const USER_ID = "550e8400-e29b-41d4-a716-446655440001" as UserId;
const PRODUCT_ID = "550e8400-e29b-41d4-a716-446655440002" as ProductId;

const ITEM: OrderItem = {
  productId: PRODUCT_ID,
  productName: "Test Product",
  unitPrice: 1000 as Price,
  quantity: 2 as StockCount,
  subtotal: 2000,
};

const ADDRESS: ShippingAddress = {
  postalCode: "100-0001",
  prefecture: "東京都",
  city: "千代田区",
  street: "1-1",
  recipientName: "山田 太郎",
  phone: "090-0000-0000",
};

function makeAcceptedOrder() {
  return createOrder({
    id: ORDER_ID,
    customerId: USER_ID,
    items: [ITEM],
    shippingAddress: ADDRESS,
    paymentMethod: "CREDIT_CARD",
    subtotal: 2000,
    shippingFee: 500,
  });
}

// ---------------------------------------------------------------------------
// createOrder
// ---------------------------------------------------------------------------

describe("createOrder", () => {
  it("sets initial status to ACCEPTED", () => {
    const order = makeAcceptedOrder();
    expect(order.status).toBe("ACCEPTED");
  });

  it("calculates total as subtotal + shippingFee", () => {
    const order = makeAcceptedOrder();
    expect(order.total).toBe(2500); // 2000 + 500
  });
});

// ---------------------------------------------------------------------------
// shipOrder
// ---------------------------------------------------------------------------

describe("shipOrder", () => {
  it("transitions ACCEPTED → SHIPPED (valid)", () => {
    const order = makeAcceptedOrder();
    const shipped = shipOrder(order);
    expect(shipped.status).toBe("SHIPPED");
  });

  it("throws when order is already SHIPPED (invalid)", () => {
    const order = shipOrder(makeAcceptedOrder());
    expect(() => shipOrder(order)).toThrow();
  });

  it("throws when order is COMPLETED (invalid)", () => {
    const order = completeOrder(shipOrder(makeAcceptedOrder()));
    expect(() => shipOrder(order)).toThrow();
  });

  it("throws when order is CANCELLED (invalid)", () => {
    const order = cancelOrder(makeAcceptedOrder());
    expect(() => shipOrder(order)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// completeOrder
// ---------------------------------------------------------------------------

describe("completeOrder", () => {
  it("transitions SHIPPED → COMPLETED (valid)", () => {
    const order = shipOrder(makeAcceptedOrder());
    const completed = completeOrder(order);
    expect(completed.status).toBe("COMPLETED");
  });

  it("throws when order is ACCEPTED (not yet shipped — invalid)", () => {
    const order = makeAcceptedOrder();
    expect(() => completeOrder(order)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// cancelOrder
// ---------------------------------------------------------------------------

describe("cancelOrder", () => {
  it("transitions ACCEPTED → CANCELLED (valid)", () => {
    const order = makeAcceptedOrder();
    const cancelled = cancelOrder(order);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("transitions SHIPPED → CANCELLED (valid)", () => {
    const order = shipOrder(makeAcceptedOrder());
    const cancelled = cancelOrder(order);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("throws ORDER_ALREADY_COMPLETED when order is COMPLETED (invalid)", () => {
    const order = completeOrder(shipOrder(makeAcceptedOrder()));
    expect(() => cancelOrder(order)).toThrow("ORDER_ALREADY_COMPLETED");
  });

  it("throws when order is already CANCELLED (invalid)", () => {
    const order = cancelOrder(makeAcceptedOrder());
    expect(() => cancelOrder(order)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// completeRefund
// ---------------------------------------------------------------------------

describe("completeRefund", () => {
  it("returns the order unchanged when it is CANCELLED (valid)", () => {
    const order = cancelOrder(makeAcceptedOrder());
    const result = completeRefund(order);
    expect(result.status).toBe("CANCELLED");
  });

  it("throws when order is ACCEPTED (refund requires CANCELLED — invalid)", () => {
    const order = makeAcceptedOrder();
    expect(() => completeRefund(order)).toThrow();
  });
});
