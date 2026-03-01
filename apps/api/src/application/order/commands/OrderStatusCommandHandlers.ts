import type { EventStore } from "../../../infrastructure/event-store/EventStore";
import type { OrderProjection } from "../../../infrastructure/projection/OrderProjection";
import { shipOrder, completeOrder, type OrderStatus } from "../../../domain/order/Order";
import type { OrderEvent } from "../../../domain/order/OrderEvents";
import { parseOrderId } from "../../../domain/shared/ValueObjects";
import { replayOrder } from "./CheckoutCommandHandlers";

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

export type ShipOrderCommand = {
  readonly orderId: string;
};

export type CompleteOrderCommand = {
  readonly orderId: string;
};

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

type OrderStatusCommandContext = {
  readonly eventStore: EventStore;
  readonly orderProjection: OrderProjection;
};

// ---------------------------------------------------------------------------
// Allowed transitions per status (for error reporting)
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  ACCEPTED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleShipOrder(
  cmd: ShipOrderCommand,
  ctx: OrderStatusCommandContext,
): Promise<void> {
  const orderId = parseOrderId(cmd.orderId);
  const events = await ctx.eventStore.loadEvents(orderId);
  const order = replayOrder(events);

  if (!order) {
    throw { code: "ORDER_NOT_FOUND" as const };
  }

  let shipped;
  try {
    shipped = shipOrder(order);
  } catch {
    throw {
      code: "INVALID_ORDER_STATUS_TRANSITION" as const,
      currentStatus: order.status,
      allowedTransitions: ALLOWED_TRANSITIONS[order.status],
    };
  }

  const event: OrderEvent = {
    type: "OrderShipped",
    orderId: shipped.id,
  };

  await ctx.eventStore.append(
    order.id,
    "order",
    [{ type: event.type, payload: event }],
    order.version,
  );
  await ctx.orderProjection.apply(event);
}

export async function handleCompleteOrder(
  cmd: CompleteOrderCommand,
  ctx: OrderStatusCommandContext,
): Promise<void> {
  const orderId = parseOrderId(cmd.orderId);
  const events = await ctx.eventStore.loadEvents(orderId);
  const order = replayOrder(events);

  if (!order) {
    throw { code: "ORDER_NOT_FOUND" as const };
  }

  let completed;
  try {
    completed = completeOrder(order);
  } catch {
    throw {
      code: "INVALID_ORDER_STATUS_TRANSITION" as const,
      currentStatus: order.status,
      allowedTransitions: ALLOWED_TRANSITIONS[order.status],
    };
  }

  const event: OrderEvent = {
    type: "OrderCompleted",
    orderId: completed.id,
  };

  await ctx.eventStore.append(
    order.id,
    "order",
    [{ type: event.type, payload: event }],
    order.version,
  );
  await ctx.orderProjection.apply(event);
}
