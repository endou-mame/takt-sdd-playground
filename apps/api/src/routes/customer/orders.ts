import { Hono } from "hono";
import type { Bindings } from "../../worker";
import type { AuthVariables } from "../../middleware/authMiddleware";
import { authMiddleware } from "../../middleware/authMiddleware";
import {
  handleListMyOrders,
  handleGetOrderDetail,
} from "../../application/order/queries/OrderQueryHandlers";
import { DrizzleOrderRepository } from "../../infrastructure/repository/DrizzleOrderRepository";

type AppEnv = { Bindings: Bindings; Variables: AuthVariables };

export const customerOrdersRouter = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// GET /orders
// ---------------------------------------------------------------------------

customerOrdersRouter.get("/", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const ctx = { orderRepository: new DrizzleOrderRepository(c.env.EVENTS_DB) };
  const orders = await handleListMyOrders(userId, ctx);
  return c.json(orders);
});

// ---------------------------------------------------------------------------
// GET /orders/:id
// ---------------------------------------------------------------------------

customerOrdersRouter.get("/:id", authMiddleware, async (c) => {
  const orderId = c.req.param("id");
  const userId = c.get("userId");
  const ctx = { orderRepository: new DrizzleOrderRepository(c.env.EVENTS_DB) };
  const order = await handleGetOrderDetail(orderId, userId, false, ctx);
  return c.json(order);
});
