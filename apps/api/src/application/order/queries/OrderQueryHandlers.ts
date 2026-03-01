import type {
  OrderReadRepository,
  OrderRow,
  AdminOrderFilter,
} from "../../../infrastructure/repository/DrizzleOrderRepository";

// ---------------------------------------------------------------------------
// Port — implemented by DrizzleOrderRepository
// ---------------------------------------------------------------------------

export type { OrderReadRepository, AdminOrderFilter };

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

type OrderQueryContext = {
  readonly orderRepository: OrderReadRepository;
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleListMyOrders(
  customerId: string,
  ctx: OrderQueryContext,
): Promise<OrderRow[]> {
  return ctx.orderRepository.listOrdersByCustomer(customerId);
}

export async function handleGetOrderDetail(
  orderId: string,
  requesterId: string,
  isAdmin: boolean,
  ctx: OrderQueryContext,
): Promise<OrderRow> {
  const order = await ctx.orderRepository.getOrderById(orderId);

  if (!order) {
    throw { code: "ORDER_NOT_FOUND" as const };
  }

  if (!isAdmin) {
    const isOwner = await ctx.orderRepository.verifyOwnership(orderId, requesterId);
    if (!isOwner) {
      throw { code: "FORBIDDEN" as const };
    }
  }

  return order;
}

export async function handleListAllOrders(
  filter: AdminOrderFilter,
  ctx: OrderQueryContext,
): Promise<{ items: OrderRow[]; total: number }> {
  return ctx.orderRepository.listAllOrders(filter);
}
