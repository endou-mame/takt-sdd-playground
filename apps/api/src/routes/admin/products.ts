import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "../../worker";
import type { AuthVariables } from "../../middleware/authMiddleware";
import { authMiddleware, adminMiddleware } from "../../middleware/authMiddleware";
import {
  handleCreateProduct,
  handleUpdateProduct,
  handleDeleteProduct,
} from "../../application/product/commands/ProductCommandHandlers";
import { handleUpdateStock } from "../../application/product/commands/StockCommandHandlers";
import { D1EventStore } from "../../infrastructure/event-store/D1EventStore";
import { ProductProjection } from "../../infrastructure/projection/ProductProjection";
import { toValidationErrorResponse, omitUndefined } from "../utils";

type AppEnv = { Bindings: Bindings; Variables: AuthVariables };

export const adminProductsRouter = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const CreateProductSchema = z.object({
  name: z.string(),
  description: z.string(),
  price: z.number().int().min(0),
  categoryId: z.string(),
  stock: z.number().int().min(0),
});

const UpdateProductSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  price: z.number().int().min(0).optional(),
  categoryId: z.string().optional(),
});

const UpdateStockSchema = z.object({
  quantity: z.number().int().min(0),
});

// ---------------------------------------------------------------------------
// POST /admin/products
// ---------------------------------------------------------------------------

adminProductsRouter.post("/products", authMiddleware, adminMiddleware, async (c) => {
  const body = await c.req.json<unknown>();
  const result = CreateProductSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const ctx = buildCommandContext(c.env);
  const { productId } = await handleCreateProduct(result.data, ctx);
  return c.json({ productId }, 201);
});

// ---------------------------------------------------------------------------
// PUT /admin/products/:id
// ---------------------------------------------------------------------------

adminProductsRouter.put("/products/:id", authMiddleware, adminMiddleware, async (c) => {
  const body = await c.req.json<unknown>();
  const result = UpdateProductSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const productId = c.req.param("id");
  const ctx = buildCommandContext(c.env);
  await handleUpdateProduct(omitUndefined({ productId, ...result.data }), ctx);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// DELETE /admin/products/:id
// ---------------------------------------------------------------------------

adminProductsRouter.delete("/products/:id", authMiddleware, adminMiddleware, async (c) => {
  const productId = c.req.param("id");
  const ctx = buildCommandContext(c.env);
  await handleDeleteProduct({ productId }, ctx);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// PUT /admin/products/:id/stock
// ---------------------------------------------------------------------------

adminProductsRouter.put("/products/:id/stock", authMiddleware, adminMiddleware, async (c) => {
  const body = await c.req.json<unknown>();
  const result = UpdateStockSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const productId = c.req.param("id");
  const ctx = {
    eventStore: new D1EventStore(c.env.EVENTS_DB),
    projection: new ProductProjection(c.env.EVENTS_DB),
  };
  await handleUpdateStock({ productId, quantity: result.data.quantity }, ctx);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

function buildCommandContext(env: Bindings) {
  return {
    eventStore: new D1EventStore(env.EVENTS_DB),
    projection: new ProductProjection(env.EVENTS_DB),
  };
}
