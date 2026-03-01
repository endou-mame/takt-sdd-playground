import type { EventStore } from "../../../infrastructure/event-store/EventStore";
import type { OrderProjection } from "../../../infrastructure/projection/OrderProjection";
import type { ProductProjection } from "../../../infrastructure/projection/ProductProjection";
import type { PaymentGateway } from "../../../infrastructure/payment/PaymentGateway";
import type { EmailQueueProducer } from "../../../infrastructure/email/EmailQueueProducer";
import { cancelOrder, completeRefund } from "../../../domain/order/Order";
import type { OrderEvent } from "../../../domain/order/OrderEvents";
import type { ProductEvent } from "../../../domain/product/ProductEvents";
import { parseOrderId, parseProductId, type StockCount } from "../../../domain/shared/ValueObjects";
import { replayProduct } from "../../product/commands/ProductCommandHandlers";
import { replayOrder } from "./CheckoutCommandHandlers";

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

export type CancelOrderCommand = {
  readonly orderId: string;
  readonly reason: string;
};

export type RefundOrderCommand = {
  readonly orderId: string;
  readonly customerEmail: string;
};

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

type CancelRefundContext = {
  readonly eventStore: EventStore;
  readonly orderProjection: OrderProjection;
  readonly productProjection: ProductProjection;
  readonly paymentGateway: PaymentGateway;
  readonly emailQueueProducer: EmailQueueProducer;
};

// ---------------------------------------------------------------------------
// handleCancelOrder
// ---------------------------------------------------------------------------

export async function handleCancelOrder(
  cmd: CancelOrderCommand,
  ctx: CancelRefundContext,
): Promise<void> {
  const orderId = parseOrderId(cmd.orderId);
  const events = await ctx.eventStore.loadEvents(orderId);
  const order = replayOrder(events);

  if (!order) {
    throw { code: "ORDER_NOT_FOUND" as const };
  }

  try {
    cancelOrder(order);
  } catch (e) {
    if (e instanceof Error && e.message === "ORDER_ALREADY_COMPLETED") {
      throw { code: "ORDER_ALREADY_COMPLETED" as const };
    }
    if (e instanceof Error && e.message.includes("already CANCELLED")) {
      throw { code: "ORDER_ALREADY_CANCELLED" as const };
    }
    throw e;
  }

  const cancelledEvent: OrderEvent = {
    type: "OrderCancelled",
    orderId: order.id,
    reason: cmd.reason,
  };

  await ctx.eventStore.append(
    order.id,
    "order",
    [{ type: cancelledEvent.type, payload: cancelledEvent }],
    order.version,
  );
  await ctx.orderProjection.apply(cancelledEvent);

  // Restore stock for each order item
  for (const item of order.items) {
    const productId = parseProductId(item.productId);
    const productEvents = await ctx.eventStore.loadEvents(productId);
    const product = replayProduct(productEvents);

    if (product) {
      const stockIncreased: ProductEvent = {
        type: "StockIncreased",
        productId: product.id,
        quantity: item.quantity as StockCount,
        orderId: order.id,
      };

      await ctx.eventStore.append(
        product.id,
        "product",
        [{ type: stockIncreased.type, payload: stockIncreased }],
        product.version,
      );
      await ctx.productProjection.apply(stockIncreased);
    }
  }

  // Void convenience store payment if applicable
  if (order.paymentMethod === "CONVENIENCE_STORE" && order.paymentCode !== null) {
    await ctx.paymentGateway.voidConvenienceStorePayment(order.paymentCode);
  }
}

// ---------------------------------------------------------------------------
// handleRefundOrder
// ---------------------------------------------------------------------------

export async function handleRefundOrder(
  cmd: RefundOrderCommand,
  ctx: CancelRefundContext,
): Promise<void> {
  const orderId = parseOrderId(cmd.orderId);
  const events = await ctx.eventStore.loadEvents(orderId);
  const order = replayOrder(events);

  if (!order) {
    throw { code: "ORDER_NOT_FOUND" as const };
  }

  if (order.refundCompleted) {
    throw { code: "ORDER_ALREADY_REFUNDED" as const };
  }

  // Validate domain invariant: order must be CANCELLED to refund
  try {
    completeRefund(order);
  } catch {
    throw { code: "ORDER_NOT_CANCELLED" as const };
  }

  // Process credit card refund through payment gateway
  if (order.paymentMethod === "CREDIT_CARD") {
    if (!order.transactionId) {
      throw { code: "REFUND_TRANSACTION_NOT_FOUND" as const };
    }
    await ctx.paymentGateway.refund(order.transactionId, order.total);
  }

  const refundCompletedEvent: OrderEvent = {
    type: "RefundCompleted",
    orderId: order.id,
    amount: order.total,
  };

  await ctx.eventStore.append(
    order.id,
    "order",
    [{ type: refundCompletedEvent.type, payload: refundCompletedEvent }],
    order.version,
  );
  await ctx.orderProjection.apply(refundCompletedEvent);

  // Enqueue refund notification email
  await ctx.emailQueueProducer.enqueueRefundNotification({
    to: cmd.customerEmail,
    orderId: order.id,
    amount: order.total,
  });
}
