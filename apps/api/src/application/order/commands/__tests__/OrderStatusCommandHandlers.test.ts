import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleShipOrder,
  handleCompleteOrder,
  type ShipOrderCommand,
  type CompleteOrderCommand,
} from "../OrderStatusCommandHandlers";
import type { EventStore, StoredEvent } from "../../../../infrastructure/event-store/EventStore";
import type { OrderProjection } from "../../../../infrastructure/projection/OrderProjection";
import type { OrderEvent } from "../../../../domain/order/OrderEvents";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ORDER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_CUSTOMER_ID = "00000000-0000-4000-8000-000000000002";
const VALID_PRODUCT_ID = "00000000-0000-4000-8000-000000000003";

const SAMPLE_SHIPPING_ADDRESS = {
  postalCode: "100-0001",
  prefecture: "東京都",
  city: "千代田区",
  street: "1-1-1",
  recipientName: "テスト太郎",
  phone: "090-0000-0000",
};

function makeOrderCreatedEvent(version = 1): StoredEvent {
  const payload: OrderEvent = {
    type: "OrderCreated",
    orderId: VALID_ORDER_ID,
    customerId: VALID_CUSTOMER_ID,
    items: [{ productId: VALID_PRODUCT_ID, productName: "Widget", unitPrice: 1000, quantity: 1, subtotal: 1000 }],
    shippingAddress: SAMPLE_SHIPPING_ADDRESS,
    paymentMethod: "CASH_ON_DELIVERY",
    subtotal: 1000,
    shippingFee: 300,
    total: 1300,
  };
  return {
    id: crypto.randomUUID(),
    aggregateId: VALID_ORDER_ID,
    aggregateType: "order",
    version,
    eventType: "OrderCreated",
    payload,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

function makeStoredEvent(payload: OrderEvent, version: number): StoredEvent {
  return {
    id: crypto.randomUUID(),
    aggregateId: VALID_ORDER_ID,
    aggregateType: "order",
    version,
    eventType: payload.type,
    payload,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

function makeEventStore(events: StoredEvent[] = [makeOrderCreatedEvent()]): EventStore {
  return {
    append: vi.fn().mockResolvedValue(undefined),
    loadEvents: vi.fn().mockResolvedValue(events),
  };
}

function makeOrderProjection(): OrderProjection {
  return { apply: vi.fn().mockResolvedValue(undefined) } as unknown as OrderProjection;
}

// ---------------------------------------------------------------------------
// handleShipOrder
// ---------------------------------------------------------------------------

describe("handleShipOrder", () => {
  let eventStore: EventStore;
  let orderProjection: OrderProjection;

  beforeEach(() => {
    eventStore = makeEventStore([makeOrderCreatedEvent(1)]);
    orderProjection = makeOrderProjection();
  });

  it("appends OrderShipped event for ACCEPTED order", async () => {
    const cmd: ShipOrderCommand = { orderId: VALID_ORDER_ID };
    await handleShipOrder(cmd, { eventStore, orderProjection });

    const appendCall = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(appendCall[2]![0]!.type).toBe("OrderShipped");
    expect(appendCall[3]).toBe(1); // expectedVersion
    expect(orderProjection.apply).toHaveBeenCalledOnce();
  });

  it("throws ORDER_NOT_FOUND when no events exist", async () => {
    const emptyStore = makeEventStore([]);
    const cmd: ShipOrderCommand = { orderId: VALID_ORDER_ID };
    await expect(
      handleShipOrder(cmd, { eventStore: emptyStore, orderProjection }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });

  it("throws INVALID_ORDER_STATUS_TRANSITION for SHIPPED order", async () => {
    const shippedStore = makeEventStore([
      makeOrderCreatedEvent(1),
      makeStoredEvent({ type: "OrderShipped", orderId: VALID_ORDER_ID }, 2),
    ]);
    const cmd: ShipOrderCommand = { orderId: VALID_ORDER_ID };
    await expect(
      handleShipOrder(cmd, { eventStore: shippedStore, orderProjection }),
    ).rejects.toMatchObject({
      code: "INVALID_ORDER_STATUS_TRANSITION",
      currentStatus: "SHIPPED",
    });
  });

  it("throws INVALID_ORDER_STATUS_TRANSITION for COMPLETED order", async () => {
    const completedStore = makeEventStore([
      makeOrderCreatedEvent(1),
      makeStoredEvent({ type: "OrderShipped", orderId: VALID_ORDER_ID }, 2),
      makeStoredEvent({ type: "OrderCompleted", orderId: VALID_ORDER_ID }, 3),
    ]);
    const cmd: ShipOrderCommand = { orderId: VALID_ORDER_ID };
    await expect(
      handleShipOrder(cmd, { eventStore: completedStore, orderProjection }),
    ).rejects.toMatchObject({
      code: "INVALID_ORDER_STATUS_TRANSITION",
      currentStatus: "COMPLETED",
    });
  });

  it("throws Zod error for invalid orderId", async () => {
    const cmd: ShipOrderCommand = { orderId: "not-a-uuid" };
    await expect(handleShipOrder(cmd, { eventStore, orderProjection })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleCompleteOrder
// ---------------------------------------------------------------------------

describe("handleCompleteOrder", () => {
  let orderProjection: OrderProjection;

  beforeEach(() => {
    orderProjection = makeOrderProjection();
  });

  it("appends OrderCompleted event for SHIPPED order", async () => {
    const shippedStore = makeEventStore([
      makeOrderCreatedEvent(1),
      makeStoredEvent({ type: "OrderShipped", orderId: VALID_ORDER_ID }, 2),
    ]);
    const cmd: CompleteOrderCommand = { orderId: VALID_ORDER_ID };
    await handleCompleteOrder(cmd, { eventStore: shippedStore, orderProjection });

    const appendCall = (shippedStore.append as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(appendCall[2]![0]!.type).toBe("OrderCompleted");
    expect(appendCall[3]).toBe(2); // expectedVersion after OrderShipped
    expect(orderProjection.apply).toHaveBeenCalledOnce();
  });

  it("throws INVALID_ORDER_STATUS_TRANSITION for ACCEPTED order", async () => {
    const acceptedStore = makeEventStore([makeOrderCreatedEvent(1)]);
    const cmd: CompleteOrderCommand = { orderId: VALID_ORDER_ID };
    await expect(
      handleCompleteOrder(cmd, { eventStore: acceptedStore, orderProjection }),
    ).rejects.toMatchObject({
      code: "INVALID_ORDER_STATUS_TRANSITION",
      currentStatus: "ACCEPTED",
    });
  });

  it("throws INVALID_ORDER_STATUS_TRANSITION for CANCELLED order", async () => {
    const cancelledStore = makeEventStore([
      makeOrderCreatedEvent(1),
      makeStoredEvent({ type: "OrderCancelled", orderId: VALID_ORDER_ID, reason: "test" }, 2),
    ]);
    const cmd: CompleteOrderCommand = { orderId: VALID_ORDER_ID };
    await expect(
      handleCompleteOrder(cmd, { eventStore: cancelledStore, orderProjection }),
    ).rejects.toMatchObject({
      code: "INVALID_ORDER_STATUS_TRANSITION",
      currentStatus: "CANCELLED",
    });
  });

  it("throws ORDER_NOT_FOUND when no events exist", async () => {
    const emptyStore = makeEventStore([]);
    const cmd: CompleteOrderCommand = { orderId: VALID_ORDER_ID };
    await expect(
      handleCompleteOrder(cmd, { eventStore: emptyStore, orderProjection }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });
});
