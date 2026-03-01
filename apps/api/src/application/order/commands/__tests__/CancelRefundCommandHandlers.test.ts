import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleCancelOrder,
  handleRefundOrder,
  type CancelOrderCommand,
  type RefundOrderCommand,
} from "../CancelRefundCommandHandlers";
import type { EventStore, StoredEvent } from "../../../../infrastructure/event-store/EventStore";
import type { OrderProjection } from "../../../../infrastructure/projection/OrderProjection";
import type { ProductProjection } from "../../../../infrastructure/projection/ProductProjection";
import type { PaymentGateway } from "../../../../infrastructure/payment/PaymentGateway";
import type { EmailQueueProducer } from "../../../../infrastructure/email/EmailQueueProducer";
import type { OrderEvent } from "../../../../domain/order/OrderEvents";
import type { ProductEvent } from "../../../../domain/product/ProductEvents";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ORDER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_CUSTOMER_ID = "00000000-0000-4000-8000-000000000002";
const VALID_PRODUCT_ID = "00000000-0000-4000-8000-000000000003";
const VALID_CATEGORY_ID = "00000000-0000-4000-8000-000000000004";

const SAMPLE_SHIPPING_ADDRESS = {
  postalCode: "100-0001",
  prefecture: "東京都",
  city: "千代田区",
  street: "1-1-1",
  recipientName: "テスト太郎",
  phone: "090-0000-0000",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOrderEvent(overrides: Partial<OrderEvent> = {}): OrderEvent {
  return {
    type: "OrderCreated",
    orderId: VALID_ORDER_ID,
    customerId: VALID_CUSTOMER_ID,
    items: [{ productId: VALID_PRODUCT_ID, productName: "Widget", unitPrice: 1000, quantity: 2, subtotal: 2000 }],
    shippingAddress: SAMPLE_SHIPPING_ADDRESS,
    paymentMethod: "CASH_ON_DELIVERY",
    subtotal: 2000,
    shippingFee: 300,
    total: 2300,
    ...overrides,
  } as OrderEvent;
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

function makeProductStoredEvent(version = 1): StoredEvent {
  const payload: ProductEvent = {
    type: "ProductCreated",
    productId: VALID_PRODUCT_ID,
    name: "Widget",
    description: "Desc",
    price: 1000,
    categoryId: VALID_CATEGORY_ID,
    stock: 5,
  };
  return {
    id: crypto.randomUUID(),
    aggregateId: VALID_PRODUCT_ID,
    aggregateType: "product",
    version,
    eventType: "ProductCreated",
    payload,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

function makeEventStore(
  orderEvents: StoredEvent[] = [makeStoredEvent(makeOrderEvent(), 1)],
  productEvents: StoredEvent[] = [makeProductStoredEvent()],
): EventStore {
  return {
    append: vi.fn().mockResolvedValue(undefined),
    loadEvents: vi.fn().mockImplementation((aggregateId: string) => {
      if (aggregateId === VALID_PRODUCT_ID) return Promise.resolve(productEvents);
      return Promise.resolve(orderEvents);
    }),
  };
}

function makeOrderProjection(): OrderProjection {
  return { apply: vi.fn().mockResolvedValue(undefined) } as unknown as OrderProjection;
}

function makeProductProjection(): ProductProjection {
  return { apply: vi.fn().mockResolvedValue(undefined) } as unknown as ProductProjection;
}

function makePaymentGateway(): PaymentGateway {
  return {
    chargeCreditCard: vi.fn().mockResolvedValue({ transactionId: "txn-001" }),
    issueConvenienceStorePayment: vi.fn().mockResolvedValue({
      paymentCode: "CONV-001",
      expiresAt: "2024-01-04T00:00:00.000Z",
    }),
    refund: vi.fn().mockResolvedValue({ refundId: "ref-001" }),
    voidConvenienceStorePayment: vi.fn().mockResolvedValue(undefined),
  };
}

function makeEmailQueueProducer(): EmailQueueProducer {
  return {
    enqueueOrderConfirmation: vi.fn().mockResolvedValue(undefined),
    enqueueRefundNotification: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// handleCancelOrder
// ---------------------------------------------------------------------------

describe("handleCancelOrder", () => {
  let eventStore: EventStore;
  let orderProjection: OrderProjection;
  let productProjection: ProductProjection;
  let paymentGateway: PaymentGateway;
  let emailQueueProducer: EmailQueueProducer;

  beforeEach(() => {
    eventStore = makeEventStore();
    orderProjection = makeOrderProjection();
    productProjection = makeProductProjection();
    paymentGateway = makePaymentGateway();
    emailQueueProducer = makeEmailQueueProducer();
  });

  const ctx = () => ({ eventStore, orderProjection, productProjection, paymentGateway, emailQueueProducer });

  it("appends OrderCancelled and applies projection for ACCEPTED order", async () => {
    const cmd: CancelOrderCommand = { orderId: VALID_ORDER_ID, reason: "Customer request" };
    await handleCancelOrder(cmd, ctx());

    const appendCalls = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls;
    expect(appendCalls[0]![2]![0]!.type).toBe("OrderCancelled");
    expect(appendCalls[0]![2]![0]!.payload.reason).toBe("Customer request");
    expect(orderProjection.apply).toHaveBeenCalledOnce();
  });

  it("appends StockIncreased for each order item", async () => {
    const cmd: CancelOrderCommand = { orderId: VALID_ORDER_ID, reason: "Test" };
    await handleCancelOrder(cmd, ctx());

    expect(productProjection.apply).toHaveBeenCalledOnce();
    const applied = (productProjection.apply as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(applied.type).toBe("StockIncreased");
    expect(applied.quantity).toBe(2); // quantity from order item
  });

  it("throws ORDER_ALREADY_COMPLETED for COMPLETED order", async () => {
    const completedStore = makeEventStore([
      makeStoredEvent(makeOrderEvent(), 1),
      makeStoredEvent({ type: "OrderShipped", orderId: VALID_ORDER_ID }, 2),
      makeStoredEvent({ type: "OrderCompleted", orderId: VALID_ORDER_ID }, 3),
    ]);
    const cmd: CancelOrderCommand = { orderId: VALID_ORDER_ID, reason: "Test" };
    await expect(
      handleCancelOrder(cmd, { ...ctx(), eventStore: completedStore }),
    ).rejects.toMatchObject({ code: "ORDER_ALREADY_COMPLETED" });
  });

  it("throws ORDER_ALREADY_CANCELLED for already CANCELLED order", async () => {
    const cancelledStore = makeEventStore([
      makeStoredEvent(makeOrderEvent(), 1),
      makeStoredEvent({ type: "OrderCancelled", orderId: VALID_ORDER_ID, reason: "first" }, 2),
    ]);
    const cmd: CancelOrderCommand = { orderId: VALID_ORDER_ID, reason: "Test" };
    await expect(
      handleCancelOrder(cmd, { ...ctx(), eventStore: cancelledStore }),
    ).rejects.toMatchObject({ code: "ORDER_ALREADY_CANCELLED" });
  });

  it("voids convenience store payment when paymentMethod is CONVENIENCE_STORE", async () => {
    const convOrderEvent = makeOrderEvent({ paymentMethod: "CONVENIENCE_STORE" });
    const convPaymentEvent: OrderEvent = {
      type: "ConvenienceStorePaymentIssued",
      orderId: VALID_ORDER_ID,
      paymentCode: "CONV-XYZ",
      expiresAt: "2024-01-04T00:00:00.000Z",
    };
    const convStore = makeEventStore([
      makeStoredEvent(convOrderEvent, 1),
      makeStoredEvent(convPaymentEvent, 2),
    ]);

    const cmd: CancelOrderCommand = { orderId: VALID_ORDER_ID, reason: "Test" };
    await handleCancelOrder(cmd, { ...ctx(), eventStore: convStore });

    expect(paymentGateway.voidConvenienceStorePayment).toHaveBeenCalledWith("CONV-XYZ");
  });

  it("does not void payment for CASH_ON_DELIVERY order", async () => {
    const cmd: CancelOrderCommand = { orderId: VALID_ORDER_ID, reason: "Test" };
    await handleCancelOrder(cmd, ctx());

    expect(paymentGateway.voidConvenienceStorePayment).not.toHaveBeenCalled();
  });

  it("throws ORDER_NOT_FOUND when no events exist", async () => {
    const emptyStore = makeEventStore([]);
    const cmd: CancelOrderCommand = { orderId: VALID_ORDER_ID, reason: "Test" };
    await expect(
      handleCancelOrder(cmd, { ...ctx(), eventStore: emptyStore }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });
});

// ---------------------------------------------------------------------------
// handleRefundOrder
// ---------------------------------------------------------------------------

describe("handleRefundOrder", () => {
  let orderProjection: OrderProjection;
  let productProjection: ProductProjection;
  let paymentGateway: PaymentGateway;
  let emailQueueProducer: EmailQueueProducer;

  const cancelledOrderEvents = [
    makeStoredEvent(makeOrderEvent(), 1),
    makeStoredEvent({ type: "OrderCancelled", orderId: VALID_ORDER_ID, reason: "test" }, 2),
  ];

  beforeEach(() => {
    orderProjection = makeOrderProjection();
    productProjection = makeProductProjection();
    paymentGateway = makePaymentGateway();
    emailQueueProducer = makeEmailQueueProducer();
  });

  const ctx = (eventStore: EventStore) => ({
    eventStore, orderProjection, productProjection, paymentGateway, emailQueueProducer,
  });

  it("appends RefundCompleted and enqueues email for CANCELLED CASH_ON_DELIVERY order", async () => {
    const eventStore = makeEventStore(cancelledOrderEvents);
    const cmd: RefundOrderCommand = { orderId: VALID_ORDER_ID, customerEmail: "user@example.com" };
    await handleRefundOrder(cmd, ctx(eventStore));

    const appendCall = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(appendCall[2]![0]!.type).toBe("RefundCompleted");
    expect(emailQueueProducer.enqueueRefundNotification).toHaveBeenCalledOnce();
    const emailCall = (emailQueueProducer.enqueueRefundNotification as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(emailCall.to).toBe("user@example.com");
    expect(emailCall.orderId).toBe(VALID_ORDER_ID);
  });

  it("calls paymentGateway.refund for CREDIT_CARD order", async () => {
    // subtotal: 2000, shippingFee: 300 → total: 2300 (calculated by createOrder)
    const creditCardOrderEvent = makeOrderEvent({ paymentMethod: "CREDIT_CARD" });
    const paymentCompletedEvent: OrderEvent = {
      type: "PaymentCompleted",
      orderId: VALID_ORDER_ID,
      paymentMethod: "CREDIT_CARD",
      transactionId: "txn-abc",
    };
    const creditCardCancelledEvents = [
      makeStoredEvent(creditCardOrderEvent, 1),
      makeStoredEvent(paymentCompletedEvent, 2),
      makeStoredEvent({ type: "OrderCancelled", orderId: VALID_ORDER_ID, reason: "test" }, 3),
    ];
    const eventStore = makeEventStore(creditCardCancelledEvents);

    const cmd: RefundOrderCommand = { orderId: VALID_ORDER_ID, customerEmail: "user@example.com" };
    await handleRefundOrder(cmd, ctx(eventStore));

    // total = subtotal(2000) + shippingFee(300) as recalculated by createOrder
    expect(paymentGateway.refund).toHaveBeenCalledWith("txn-abc", 2300);
  });

  it("throws ORDER_NOT_CANCELLED for ACCEPTED order", async () => {
    const eventStore = makeEventStore([makeStoredEvent(makeOrderEvent(), 1)]);
    const cmd: RefundOrderCommand = { orderId: VALID_ORDER_ID, customerEmail: "user@example.com" };
    await expect(
      handleRefundOrder(cmd, ctx(eventStore)),
    ).rejects.toMatchObject({ code: "ORDER_NOT_CANCELLED" });
  });

  it("throws ORDER_ALREADY_REFUNDED when order has already been refunded", async () => {
    const alreadyRefundedEvents = [
      ...cancelledOrderEvents,
      makeStoredEvent({ type: "RefundCompleted", orderId: VALID_ORDER_ID, amount: 2000 }, 3),
    ];
    const eventStore = makeEventStore(alreadyRefundedEvents);
    const cmd: RefundOrderCommand = { orderId: VALID_ORDER_ID, customerEmail: "user@example.com" };
    await expect(
      handleRefundOrder(cmd, ctx(eventStore)),
    ).rejects.toMatchObject({ code: "ORDER_ALREADY_REFUNDED" });
  });

  it("throws ORDER_NOT_FOUND when no events exist", async () => {
    const eventStore = makeEventStore([]);
    const cmd: RefundOrderCommand = { orderId: VALID_ORDER_ID, customerEmail: "user@example.com" };
    await expect(
      handleRefundOrder(cmd, ctx(eventStore)),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });
});
