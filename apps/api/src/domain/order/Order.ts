import type { OrderId, Price, ProductId, StockCount, UserId } from "../shared/ValueObjects";

export type OrderStatus = "ACCEPTED" | "SHIPPED" | "COMPLETED" | "CANCELLED";
export type PaymentMethod = "CREDIT_CARD" | "CONVENIENCE_STORE" | "CASH_ON_DELIVERY";

export type OrderItem = {
  readonly productId: ProductId;
  readonly productName: string;
  readonly unitPrice: Price;
  readonly quantity: StockCount;
  readonly subtotal: number;
};

export type ShippingAddress = {
  readonly postalCode: string;
  readonly prefecture: string;
  readonly city: string;
  readonly street: string;
  readonly recipientName: string;
  readonly phone: string;
};

export type Order = {
  readonly id: OrderId;
  readonly customerId: UserId;
  readonly items: readonly OrderItem[];
  readonly shippingAddress: ShippingAddress;
  readonly paymentMethod: PaymentMethod;
  readonly subtotal: number;
  readonly shippingFee: number;
  readonly total: number;
  readonly status: OrderStatus;
  readonly version: number;
};

export type CreateOrderParams = {
  readonly id: OrderId;
  readonly customerId: UserId;
  readonly items: readonly OrderItem[];
  readonly shippingAddress: ShippingAddress;
  readonly paymentMethod: PaymentMethod;
  readonly subtotal: number;
  readonly shippingFee: number;
};

export function createOrder(params: CreateOrderParams): Order {
  return {
    id: params.id,
    customerId: params.customerId,
    items: params.items,
    shippingAddress: params.shippingAddress,
    paymentMethod: params.paymentMethod,
    subtotal: params.subtotal,
    shippingFee: params.shippingFee,
    total: params.subtotal + params.shippingFee,
    status: "ACCEPTED",
    version: 0,
  };
}

// ACCEPTED → SHIPPED (administrator action)
export function shipOrder(order: Order): Order {
  if (order.status !== "ACCEPTED") {
    throw new Error(
      `Cannot ship order in status ${order.status}. Order must be ACCEPTED.`,
    );
  }
  return {
    ...order,
    status: "SHIPPED",
  };
}

// SHIPPED → COMPLETED (administrator action)
export function completeOrder(order: Order): Order {
  if (order.status !== "SHIPPED") {
    throw new Error(
      `Cannot complete order in status ${order.status}. Order must be SHIPPED.`,
    );
  }
  return {
    ...order,
    status: "COMPLETED",
  };
}

// ACCEPTED | SHIPPED → CANCELLED (administrator action)
export function cancelOrder(order: Order): Order {
  if (order.status === "COMPLETED") {
    throw new Error("ORDER_ALREADY_COMPLETED");
  }
  if (order.status === "CANCELLED") {
    throw new Error(
      `Cannot cancel order in status ${order.status}. Order is already CANCELLED.`,
    );
  }
  return {
    ...order,
    status: "CANCELLED",
  };
}

export function completeRefund(order: Order): Order {
  if (order.status !== "CANCELLED") {
    throw new Error(
      `Cannot process refund for order in status ${order.status}. Order must be CANCELLED.`,
    );
  }
  return order;
}
