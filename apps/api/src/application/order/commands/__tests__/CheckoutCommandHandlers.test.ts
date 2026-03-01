import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleCheckout,
  replayOrder,
  type CheckoutCommand,
  type CartItem,
} from "../CheckoutCommandHandlers";
import type { EventStore, StoredEvent } from "../../../../infrastructure/event-store/EventStore";
import type { OrderProjection } from "../../../../infrastructure/projection/OrderProjection";
import type { ProductProjection } from "../../../../infrastructure/projection/ProductProjection";
import type { PaymentGateway } from "../../../../infrastructure/payment/PaymentGateway";
import type { EmailQueueProducer } from "../../../../infrastructure/email/EmailQueueProducer";
import type { OrderEvent } from "../../../../domain/order/OrderEvents";
import type { ProductEvent } from "../../../../domain/product/ProductEvents";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_CUSTOMER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_PRODUCT_ID = "00000000-0000-4000-8000-000000000002";
const VALID_CATEGORY_ID = "00000000-0000-4000-8000-000000000003";
const VALID_ORDER_ID = "00000000-0000-4000-8000-000000000004";

const SAMPLE_SHIPPING_ADDRESS = {
  postalCode: "100-0001",
  prefecture: "東京都",
  city: "千代田区",
  street: "1-1-1",
  recipientName: "テスト太郎",
  phone: "090-0000-0000",
};

const SAMPLE_CART_ITEM: CartItem = {
  productId: VALID_PRODUCT_ID,
  productName: "Widget",
  unitPrice: 1000,
  quantity: 2,
};

function makeProductCreatedEvent(version = 1): StoredEvent {
  const payload: ProductEvent = {
    type: "ProductCreated",
    productId: VALID_PRODUCT_ID,
    name: "Widget",
    description: "Desc",
    price: 1000,
    categoryId: VALID_CATEGORY_ID,
    stock: 10,
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
  orderEvents: StoredEvent[] = [],
  productEvents: StoredEvent[] = [makeProductCreatedEvent()],
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
    issueConvenienceStorePayment: vi
      .fn()
      .mockResolvedValue({ paymentCode: "CONV-001", expiresAt: "2024-01-04T00:00:00.000Z" }),
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
// replayOrder
// ---------------------------------------------------------------------------

describe("replayOrder", () => {
  it("returns null for empty events", () => {
    expect(replayOrder([])).toBeNull();
  });

  it("builds order from OrderCreated event", () => {
    const payload: OrderEvent = {
      type: "OrderCreated",
      orderId: VALID_ORDER_ID,
      customerId: VALID_CUSTOMER_ID,
      items: [{ productId: VALID_PRODUCT_ID, productName: "Widget", unitPrice: 1000, quantity: 2, subtotal: 2000 }],
      shippingAddress: SAMPLE_SHIPPING_ADDRESS,
      paymentMethod: "CASH_ON_DELIVERY",
      subtotal: 2000,
      shippingFee: 300,
      total: 2300,
    };
    const stored: StoredEvent = {
      id: crypto.randomUUID(),
      aggregateId: VALID_ORDER_ID,
      aggregateType: "order",
      version: 1,
      eventType: "OrderCreated",
      payload,
      createdAt: "2024-01-01T00:00:00.000Z",
    };

    const result = replayOrder([stored]);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(VALID_ORDER_ID);
    expect(result?.status).toBe("ACCEPTED");
    expect(result?.transactionId).toBeNull();
    expect(result?.paymentCode).toBeNull();
    expect(result?.version).toBe(1);
  });

  it("captures transactionId from PaymentCompleted", () => {
    const orderCreated: StoredEvent = {
      id: crypto.randomUUID(),
      aggregateId: VALID_ORDER_ID,
      aggregateType: "order",
      version: 1,
      eventType: "OrderCreated",
      payload: {
        type: "OrderCreated",
        orderId: VALID_ORDER_ID,
        customerId: VALID_CUSTOMER_ID,
        items: [{ productId: VALID_PRODUCT_ID, productName: "Widget", unitPrice: 1000, quantity: 1, subtotal: 1000 }],
        shippingAddress: SAMPLE_SHIPPING_ADDRESS,
        paymentMethod: "CREDIT_CARD",
        subtotal: 1000,
        shippingFee: 0,
        total: 1000,
      } satisfies OrderEvent,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const paymentCompleted: StoredEvent = {
      id: crypto.randomUUID(),
      aggregateId: VALID_ORDER_ID,
      aggregateType: "order",
      version: 2,
      eventType: "PaymentCompleted",
      payload: {
        type: "PaymentCompleted",
        orderId: VALID_ORDER_ID,
        paymentMethod: "CREDIT_CARD",
        transactionId: "txn-abc",
      } satisfies OrderEvent,
      createdAt: "2024-01-01T00:00:00.000Z",
    };

    const result = replayOrder([orderCreated, paymentCompleted]);
    expect(result?.transactionId).toBe("txn-abc");
    expect(result?.version).toBe(2);
  });

  it("captures paymentCode from ConvenienceStorePaymentIssued", () => {
    const orderCreated: StoredEvent = {
      id: crypto.randomUUID(),
      aggregateId: VALID_ORDER_ID,
      aggregateType: "order",
      version: 1,
      eventType: "OrderCreated",
      payload: {
        type: "OrderCreated",
        orderId: VALID_ORDER_ID,
        customerId: VALID_CUSTOMER_ID,
        items: [{ productId: VALID_PRODUCT_ID, productName: "Widget", unitPrice: 1000, quantity: 1, subtotal: 1000 }],
        shippingAddress: SAMPLE_SHIPPING_ADDRESS,
        paymentMethod: "CONVENIENCE_STORE",
        subtotal: 1000,
        shippingFee: 0,
        total: 1000,
      } satisfies OrderEvent,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const convEvent: StoredEvent = {
      id: crypto.randomUUID(),
      aggregateId: VALID_ORDER_ID,
      aggregateType: "order",
      version: 2,
      eventType: "ConvenienceStorePaymentIssued",
      payload: {
        type: "ConvenienceStorePaymentIssued",
        orderId: VALID_ORDER_ID,
        paymentCode: "CONV-XYZ",
        expiresAt: "2024-01-04T00:00:00.000Z",
      } satisfies OrderEvent,
      createdAt: "2024-01-01T00:00:00.000Z",
    };

    const result = replayOrder([orderCreated, convEvent]);
    expect(result?.paymentCode).toBe("CONV-XYZ");
  });

  it("transitions status through OrderShipped and OrderCompleted", () => {
    const base: StoredEvent = {
      id: crypto.randomUUID(),
      aggregateId: VALID_ORDER_ID,
      aggregateType: "order",
      version: 1,
      eventType: "OrderCreated",
      payload: {
        type: "OrderCreated",
        orderId: VALID_ORDER_ID,
        customerId: VALID_CUSTOMER_ID,
        items: [{ productId: VALID_PRODUCT_ID, productName: "Widget", unitPrice: 1000, quantity: 1, subtotal: 1000 }],
        shippingAddress: SAMPLE_SHIPPING_ADDRESS,
        paymentMethod: "CASH_ON_DELIVERY",
        subtotal: 1000,
        shippingFee: 300,
        total: 1300,
      } satisfies OrderEvent,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const shipped: StoredEvent = {
      id: crypto.randomUUID(), aggregateId: VALID_ORDER_ID, aggregateType: "order",
      version: 2, eventType: "OrderShipped",
      payload: { type: "OrderShipped", orderId: VALID_ORDER_ID } satisfies OrderEvent,
      createdAt: "2024-01-02T00:00:00.000Z",
    };
    const completed: StoredEvent = {
      id: crypto.randomUUID(), aggregateId: VALID_ORDER_ID, aggregateType: "order",
      version: 3, eventType: "OrderCompleted",
      payload: { type: "OrderCompleted", orderId: VALID_ORDER_ID } satisfies OrderEvent,
      createdAt: "2024-01-03T00:00:00.000Z",
    };

    const result = replayOrder([base, shipped, completed]);
    expect(result?.status).toBe("COMPLETED");
    expect(result?.version).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// handleCheckout
// ---------------------------------------------------------------------------

describe("handleCheckout", () => {
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

  const baseCmd: CheckoutCommand = {
    customerId: VALID_CUSTOMER_ID,
    cartItems: [SAMPLE_CART_ITEM],
    shippingAddress: SAMPLE_SHIPPING_ADDRESS,
    paymentMethod: "CASH_ON_DELIVERY",
    customerEmail: "test@example.com",
  };

  it("throws CART_EMPTY when cartItems is empty", async () => {
    const cmd: CheckoutCommand = { ...baseCmd, cartItems: [] };
    await expect(
      handleCheckout(cmd, { eventStore, orderProjection, productProjection, paymentGateway, emailQueueProducer }),
    ).rejects.toMatchObject({ code: "CART_EMPTY" });
  });

  it("appends OrderCreated and applies projection for COD", async () => {
    const result = await handleCheckout(baseCmd, {
      eventStore, orderProjection, productProjection, paymentGateway, emailQueueProducer,
    });

    expect(result.orderId).toBeTypeOf("string");
    const appendCalls = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls;
    // First append: OrderCreated
    expect(appendCalls[0]![2]![0]!.type).toBe("OrderCreated");
    expect(appendCalls[0]![3]).toBe(0);
    // No payment gateway calls for COD
    expect(paymentGateway.chargeCreditCard).not.toHaveBeenCalled();
    // OrderProjection applied once for COD (OrderCreated only)
    expect(orderProjection.apply).toHaveBeenCalledOnce();
    // Email confirmation enqueued
    expect(emailQueueProducer.enqueueOrderConfirmation).toHaveBeenCalledOnce();
  });

  it("adds COD surcharge to shippingFee", async () => {
    await handleCheckout(baseCmd, {
      eventStore, orderProjection, productProjection, paymentGateway, emailQueueProducer,
    });

    const emailCall = (emailQueueProducer.enqueueOrderConfirmation as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    // COD surcharge is 300
    expect(emailCall.shippingFee).toBe(300);
    expect(emailCall.total).toBe(2000 + 300); // 1000 * 2 + 300
  });

  it("processes CREDIT_CARD payment and appends PaymentCompleted", async () => {
    const cmd: CheckoutCommand = {
      ...baseCmd,
      paymentMethod: "CREDIT_CARD",
      creditCard: { cardNumber: "4111111111111111", cvv: "123", expiryMonth: "12", expiryYear: "2028" },
    };

    const result = await handleCheckout(cmd, {
      eventStore, orderProjection, productProjection, paymentGateway, emailQueueProducer,
    });

    expect(result.orderId).toBeTypeOf("string");
    expect(paymentGateway.chargeCreditCard).toHaveBeenCalledOnce();

    const appendCalls = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls;
    // First append: OrderCreated; second append: PaymentCompleted
    expect(appendCalls[0]![2]![0]!.type).toBe("OrderCreated");
    expect(appendCalls[1]![2]![0]!.type).toBe("PaymentCompleted");
    expect(appendCalls[1]![3]).toBe(1); // expectedVersion after OrderCreated

    // Projection applied twice: OrderCreated + PaymentCompleted
    expect(orderProjection.apply).toHaveBeenCalledTimes(2);
  });

  it("processes CONVENIENCE_STORE payment and appends ConvenienceStorePaymentIssued", async () => {
    const cmd: CheckoutCommand = { ...baseCmd, paymentMethod: "CONVENIENCE_STORE" };

    await handleCheckout(cmd, {
      eventStore, orderProjection, productProjection, paymentGateway, emailQueueProducer,
    });

    expect(paymentGateway.issueConvenienceStorePayment).toHaveBeenCalledOnce();
    const appendCalls = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls;
    expect(appendCalls[1]![2]![0]!.type).toBe("ConvenienceStorePaymentIssued");
  });

  it("throws PAYMENT_TIMEOUT when payment takes too long", async () => {
    const slowGateway = makePaymentGateway();
    (slowGateway.chargeCreditCard as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    vi.useFakeTimers();

    try {
      const cmd: CheckoutCommand = {
        ...baseCmd,
        paymentMethod: "CREDIT_CARD",
        creditCard: { cardNumber: "4111111111111111", cvv: "123", expiryMonth: "12", expiryYear: "2028" },
      };

      const promise = handleCheckout(cmd, {
        eventStore,
        orderProjection,
        productProjection,
        paymentGateway: slowGateway,
        emailQueueProducer,
      });
      // Suppress unhandled rejection during timer advancement; assertion below handles it
      promise.catch(() => {});

      // Advance async-aware to let handleCheckout reach Promise.race, then fire the timeout
      await vi.advanceTimersByTimeAsync(30_001);

      await expect(promise).rejects.toMatchObject({ code: "PAYMENT_TIMEOUT" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-throws PAYMENT_DECLINED when payment is declined", async () => {
    const decliningGateway = makePaymentGateway();
    (decliningGateway.chargeCreditCard as ReturnType<typeof vi.fn>).mockRejectedValue({
      code: "PAYMENT_DECLINED",
    });

    const cmd: CheckoutCommand = {
      ...baseCmd,
      paymentMethod: "CREDIT_CARD",
      creditCard: { cardNumber: "4111111111111111", cvv: "123", expiryMonth: "12", expiryYear: "2028" },
    };

    await expect(
      handleCheckout(cmd, {
        eventStore, orderProjection, productProjection,
        paymentGateway: decliningGateway, emailQueueProducer,
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_DECLINED" });
  });

  it("appends StockDecreased for each cart item", async () => {
    const cmd: CheckoutCommand = {
      ...baseCmd,
      cartItems: [SAMPLE_CART_ITEM],
    };

    await handleCheckout(cmd, {
      eventStore, orderProjection, productProjection, paymentGateway, emailQueueProducer,
    });

    // productProjection.apply called once for StockDecreased
    expect(productProjection.apply).toHaveBeenCalledOnce();
    const applied = (productProjection.apply as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(applied.type).toBe("StockDecreased");
    expect(applied.quantity).toBe(2);
  });

  it("does not store credit card number in events", async () => {
    const cmd: CheckoutCommand = {
      ...baseCmd,
      paymentMethod: "CREDIT_CARD",
      creditCard: {
        cardNumber: "4111111111111111",
        cvv: "123",
        expiryMonth: "12",
        expiryYear: "2028",
      },
    };

    await handleCheckout(cmd, {
      eventStore, orderProjection, productProjection, paymentGateway, emailQueueProducer,
    });

    const allAppendedPayloads = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls
      .flatMap((call: unknown[]) => (call[2] as { payload: unknown }[]).map((e) => JSON.stringify(e.payload)));

    for (const payload of allAppendedPayloads) {
      expect(payload).not.toContain("4111111111111111");
      expect(payload).not.toContain("123");
    }
  });
});
