import type { EventStore, StoredEvent } from "../../../infrastructure/event-store/EventStore";
import type { OrderProjection } from "../../../infrastructure/projection/OrderProjection";
import type { ProductProjection } from "../../../infrastructure/projection/ProductProjection";
import type { PaymentGateway } from "../../../infrastructure/payment/PaymentGateway";
import type { EmailQueueProducer } from "../../../infrastructure/email/EmailQueueProducer";
import {
  createOrder,
  shipOrder,
  completeOrder,
  cancelOrder,
  type Order,
  type PaymentMethod,
  type ShippingAddress,
} from "../../../domain/order/Order";
import type { OrderEvent } from "../../../domain/order/OrderEvents";
import type { ProductEvent } from "../../../domain/product/ProductEvents";
import {
  parseOrderId,
  parseProductId,
  parseUserId,
  type OrderId,
  type Price,
  type ProductId,
  type StockCount,
  type UserId,
} from "../../../domain/shared/ValueObjects";
import { replayProduct } from "../../product/commands/ProductCommandHandlers";

// ---------------------------------------------------------------------------
// ReplayedOrder — extends Order with payment metadata
// ---------------------------------------------------------------------------

export type ReplayedOrder = Order & {
  readonly transactionId: string | null;
  readonly paymentCode: string | null;
  readonly refundCompleted: boolean;
};

// ---------------------------------------------------------------------------
// replayOrder — exported for use by OrderStatusCommandHandlers / CancelRefundCommandHandlers
// ---------------------------------------------------------------------------

export function replayOrder(events: readonly StoredEvent[]): ReplayedOrder | null {
  if (events.length === 0) return null;

  let order: Order | undefined;
  let transactionId: string | null = null;
  let paymentCode: string | null = null;
  let refundCompleted = false;

  for (const e of events) {
    const payload = e.payload as OrderEvent;
    switch (payload.type) {
      case "OrderCreated":
        order = createOrder({
          id: payload.orderId as OrderId,
          customerId: payload.customerId as UserId,
          items: payload.items.map((item) => ({
            productId: item.productId as ProductId,
            productName: item.productName,
            unitPrice: item.unitPrice as Price,
            quantity: item.quantity as StockCount,
            subtotal: item.subtotal,
          })),
          shippingAddress: payload.shippingAddress,
          paymentMethod: payload.paymentMethod,
          subtotal: payload.subtotal,
          shippingFee: payload.shippingFee,
        });
        break;
      case "PaymentCompleted":
        transactionId = payload.transactionId;
        break;
      case "ConvenienceStorePaymentIssued":
        paymentCode = payload.paymentCode;
        break;
      case "OrderShipped":
        if (order) order = shipOrder(order);
        break;
      case "OrderCompleted":
        if (order) order = completeOrder(order);
        break;
      case "OrderCancelled":
        if (order) order = cancelOrder(order);
        break;
      case "RefundCompleted":
        refundCompleted = true;
        break;
    }
  }

  const lastVersion = events[events.length - 1]?.version ?? 0;
  return order ? { ...order, version: lastVersion, transactionId, paymentCode, refundCompleted } : null;
}

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

export type CartItem = {
  readonly productId: string;
  readonly productName: string;
  readonly unitPrice: number;
  readonly quantity: number;
};

export type CheckoutCommand = {
  readonly customerId: string;
  readonly cartItems: ReadonlyArray<CartItem>;
  readonly shippingAddress: ShippingAddress;
  readonly paymentMethod: PaymentMethod;
  readonly creditCard?: {
    readonly cardNumber: string;
    readonly cvv: string;
    readonly expiryMonth: string;
    readonly expiryYear: string;
  };
  readonly customerEmail: string;
};

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

type CheckoutContext = {
  readonly eventStore: EventStore;
  readonly orderProjection: OrderProjection;
  readonly productProjection: ProductProjection;
  readonly paymentGateway: PaymentGateway;
  readonly emailQueueProducer: EmailQueueProducer;
};

// ---------------------------------------------------------------------------
// COD surcharge constant (円)
// ---------------------------------------------------------------------------

const COD_SURCHARGE = 300;

// ---------------------------------------------------------------------------
// Helper: calculate shipping fee
// ---------------------------------------------------------------------------

function calcShippingFee(paymentMethod: PaymentMethod): number {
  return paymentMethod === "CASH_ON_DELIVERY" ? COD_SURCHARGE : 0;
}

// ---------------------------------------------------------------------------
// Helper: payment timeout promise
// ---------------------------------------------------------------------------

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject({ code: "PAYMENT_TIMEOUT" as const }), ms),
  );
}

// ---------------------------------------------------------------------------
// Helper: apply stock decrease for a cart item
// ---------------------------------------------------------------------------

async function applyStockDecrease(
  orderId: string,
  item: CartItem,
  ctx: Pick<CheckoutContext, "eventStore" | "productProjection">,
): Promise<void> {
  const productId = parseProductId(item.productId);
  const productEvents = await ctx.eventStore.loadEvents(productId);
  const product = replayProduct(productEvents);

  if (!product) {
    throw { code: "PRODUCT_NOT_FOUND" as const };
  }

  const stockDecreased: ProductEvent = {
    type: "StockDecreased",
    productId: product.id,
    quantity: item.quantity as StockCount,
    orderId,
  };

  await ctx.eventStore.append(
    product.id,
    "product",
    [{ type: stockDecreased.type, payload: stockDecreased }],
    product.version,
  );
  await ctx.productProjection.apply(stockDecreased);
}

// ---------------------------------------------------------------------------
// handleCheckout
// ---------------------------------------------------------------------------

export async function handleCheckout(
  cmd: CheckoutCommand,
  ctx: CheckoutContext,
): Promise<{ orderId: string }> {
  if (cmd.cartItems.length === 0) {
    throw { code: "CART_EMPTY" as const };
  }

  const customerId = parseUserId(cmd.customerId);
  const orderId = crypto.randomUUID() as OrderId;

  const subtotal = cmd.cartItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  const shippingFee = calcShippingFee(cmd.paymentMethod);

  const order = createOrder({
    id: orderId,
    customerId,
    items: cmd.cartItems.map((item) => ({
      productId: parseProductId(item.productId),
      productName: item.productName,
      unitPrice: item.unitPrice as Price,
      quantity: item.quantity as StockCount,
      subtotal: item.unitPrice * item.quantity,
    })),
    shippingAddress: cmd.shippingAddress,
    paymentMethod: cmd.paymentMethod,
    subtotal,
    shippingFee,
  });

  const orderCreatedEvent: OrderEvent = {
    type: "OrderCreated",
    orderId: order.id,
    customerId: order.customerId,
    items: order.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      unitPrice: item.unitPrice as number,
      quantity: item.quantity as number,
      subtotal: item.subtotal,
    })),
    shippingAddress: order.shippingAddress,
    paymentMethod: order.paymentMethod,
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    total: order.total,
  };

  await ctx.eventStore.append(
    order.id,
    "order",
    [{ type: orderCreatedEvent.type, payload: orderCreatedEvent }],
    0,
  );

  // Process payment with 30-second timeout
  if (cmd.paymentMethod === "CREDIT_CARD") {
    if (!cmd.creditCard) {
      throw { code: "PAYMENT_DECLINED" as const };
    }

    const chargeOp = ctx.paymentGateway.chargeCreditCard({
      cardNumber: cmd.creditCard.cardNumber,
      cvv: cmd.creditCard.cvv,
      expiryMonth: cmd.creditCard.expiryMonth,
      expiryYear: cmd.creditCard.expiryYear,
      amount: order.total,
      orderId: order.id,
    });

    const chargeResult = await Promise.race([chargeOp, timeout(30_000)]);

    const paymentCompletedEvent: OrderEvent = {
      type: "PaymentCompleted",
      orderId: order.id,
      paymentMethod: order.paymentMethod,
      transactionId: chargeResult.transactionId,
    };

    await ctx.eventStore.append(
      order.id,
      "order",
      [{ type: paymentCompletedEvent.type, payload: paymentCompletedEvent }],
      1,
    );
    await ctx.orderProjection.apply(orderCreatedEvent);
    await ctx.orderProjection.apply(paymentCompletedEvent);
  } else if (cmd.paymentMethod === "CONVENIENCE_STORE") {
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const issueOp = ctx.paymentGateway.issueConvenienceStorePayment({
      orderId: order.id,
      amount: order.total,
      expiresAt,
    });

    const issueResult = await Promise.race([issueOp, timeout(30_000)]);

    const convStoreEvent: OrderEvent = {
      type: "ConvenienceStorePaymentIssued",
      orderId: order.id,
      paymentCode: issueResult.paymentCode,
      expiresAt: issueResult.expiresAt,
    };

    await ctx.eventStore.append(
      order.id,
      "order",
      [{ type: convStoreEvent.type, payload: convStoreEvent }],
      1,
    );
    await ctx.orderProjection.apply(orderCreatedEvent);
    await ctx.orderProjection.apply(convStoreEvent);
  } else {
    // CASH_ON_DELIVERY: no payment event, just apply OrderCreated
    await ctx.orderProjection.apply(orderCreatedEvent);
  }

  // Decrease stock for each cart item
  for (const item of cmd.cartItems) {
    await applyStockDecrease(order.id, item, ctx);
  }

  // Enqueue order confirmation email
  await ctx.emailQueueProducer.enqueueOrderConfirmation({
    to: cmd.customerEmail,
    orderId: order.id,
    items: order.items.map((item) => ({
      name: item.productName,
      quantity: item.quantity as number,
      subtotal: item.subtotal,
    })),
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    total: order.total,
    shippingAddress: {
      recipientName: order.shippingAddress.recipientName,
      postalCode: order.shippingAddress.postalCode,
      prefecture: order.shippingAddress.prefecture,
      city: order.shippingAddress.city,
      street: order.shippingAddress.street,
    },
  });

  return { orderId: order.id };
}
