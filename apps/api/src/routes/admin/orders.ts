import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "../../worker";
import type { AuthVariables } from "../../middleware/authMiddleware";
import { authMiddleware, adminMiddleware } from "../../middleware/authMiddleware";
import {
  handleListAllOrders,
  handleGetOrderDetail,
} from "../../application/order/queries/OrderQueryHandlers";
import {
  handleShipOrder,
  handleCompleteOrder,
} from "../../application/order/commands/OrderStatusCommandHandlers";
import {
  handleCancelOrder,
  handleRefundOrder,
} from "../../application/order/commands/CancelRefundCommandHandlers";
import { D1EventStore } from "../../infrastructure/event-store/D1EventStore";
import { DrizzleOrderRepository } from "../../infrastructure/repository/DrizzleOrderRepository";
import { DrizzleUserRepository } from "../../infrastructure/repository/DrizzleUserRepository";
import { OrderProjection } from "../../infrastructure/projection/OrderProjection";
import { ProductProjection } from "../../infrastructure/projection/ProductProjection";
import { StripePaymentGateway } from "../../infrastructure/payment/StripePaymentGateway";
import { CloudflareEmailQueueProducer } from "../../infrastructure/email/EmailQueueProducer";
import { EmailRetryRepository } from "../../infrastructure/email/EmailRetryRepository";
import { toValidationErrorResponse, omitUndefined } from "../utils";

type AppEnv = { Bindings: Bindings; Variables: AuthVariables };

export const adminOrdersRouter = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ListOrdersQuerySchema = z.object({
  status: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});

const UpdateOrderStatusSchema = z.object({
  status: z.enum(["SHIPPED", "COMPLETED"]),
});

const CancelOrderSchema = z.object({
  reason: z.string(),
});

// ---------------------------------------------------------------------------
// GET /admin/orders
// ---------------------------------------------------------------------------

adminOrdersRouter.get("/orders", authMiddleware, adminMiddleware, async (c) => {
  const raw = c.req.query();
  const result = ListOrdersQuerySchema.safeParse(raw);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const ctx = { orderRepository: new DrizzleOrderRepository(c.env.EVENTS_DB) };
  const data = await handleListAllOrders(omitUndefined(result.data), ctx);
  return c.json(data);
});

// ---------------------------------------------------------------------------
// PUT /admin/orders/:id/status
// ---------------------------------------------------------------------------

adminOrdersRouter.put("/orders/:id/status", authMiddleware, adminMiddleware, async (c) => {
  const body = await c.req.json<unknown>();
  const result = UpdateOrderStatusSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const orderId = c.req.param("id");
  const ctx = {
    eventStore: new D1EventStore(c.env.EVENTS_DB),
    orderProjection: new OrderProjection(c.env.EVENTS_DB),
  };
  if (result.data.status === "SHIPPED") {
    await handleShipOrder({ orderId }, ctx);
  } else {
    await handleCompleteOrder({ orderId }, ctx);
  }
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /admin/orders/:id/cancel
// ---------------------------------------------------------------------------

adminOrdersRouter.post("/orders/:id/cancel", authMiddleware, adminMiddleware, async (c) => {
  const body = await c.req.json<unknown>();
  const result = CancelOrderSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const orderId = c.req.param("id");
  const ctx = buildCancelRefundContext(c.env);
  await handleCancelOrder({ orderId, reason: result.data.reason }, ctx);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /admin/orders/:id/refund
// ---------------------------------------------------------------------------

adminOrdersRouter.post("/orders/:id/refund", authMiddleware, adminMiddleware, async (c) => {
  const orderId = c.req.param("id");

  // Look up the order to get customerId, then look up customer email
  const orderRepo = new DrizzleOrderRepository(c.env.EVENTS_DB);
  const order = await orderRepo.getOrderById(orderId);
  if (!order) {
    throw { code: "ORDER_NOT_FOUND" as const };
  }

  const userRepo = new DrizzleUserRepository(c.env.EVENTS_DB);
  const user = await userRepo.findById(order.customerId);
  if (!user) {
    throw { code: "CUSTOMER_NOT_FOUND" as const };
  }

  const ctx = buildCancelRefundContext(c.env);
  await handleRefundOrder({ orderId, customerEmail: user.email }, ctx);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

function buildCancelRefundContext(env: Bindings) {
  return {
    eventStore: new D1EventStore(env.EVENTS_DB),
    orderProjection: new OrderProjection(env.EVENTS_DB),
    productProjection: new ProductProjection(env.EVENTS_DB),
    paymentGateway: new StripePaymentGateway(env.STRIPE_API_KEY),
    emailQueueProducer: new CloudflareEmailQueueProducer(
      env.EMAIL_QUEUE,
      new EmailRetryRepository(env.EVENTS_DB),
    ),
  };
}
