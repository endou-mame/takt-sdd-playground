import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "../../worker";
import type { AuthVariables } from "../../middleware/authMiddleware";
import { authMiddleware } from "../../middleware/authMiddleware";
import { toValidationErrorResponse } from "../utils";

type AppEnv = { Bindings: Bindings; Variables: AuthVariables };

export const cartRouter = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const AddItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
});

const UpdateItemSchema = z.object({
  quantity: z.number().int().min(0),
});

// ---------------------------------------------------------------------------
// GET /cart
// ---------------------------------------------------------------------------

cartRouter.get("/", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const stub = getCartStub(c.env, userId);
  const doRes = await stub.fetch(new Request("http://cart-do/"));
  return proxyDoResponse(doRes);
});

// ---------------------------------------------------------------------------
// POST /cart/items
// ---------------------------------------------------------------------------

cartRouter.post("/items", authMiddleware, async (c) => {
  const body = await c.req.json<unknown>();
  const result = AddItemSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const userId = c.get("userId");
  const stub = getCartStub(c.env, userId);
  const doRes = await stub.fetch(
    new Request("http://cart-do/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result.data),
    }),
  );
  return proxyDoResponse(doRes);
});

// ---------------------------------------------------------------------------
// PUT /cart/items/:productId
// ---------------------------------------------------------------------------

cartRouter.put("/items/:productId", authMiddleware, async (c) => {
  const body = await c.req.json<unknown>();
  const result = UpdateItemSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const userId = c.get("userId");
  const productId = c.req.param("productId");
  const stub = getCartStub(c.env, userId);
  const doRes = await stub.fetch(
    new Request(`http://cart-do/items/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result.data),
    }),
  );
  return proxyDoResponse(doRes);
});

// ---------------------------------------------------------------------------
// DELETE /cart/items/:productId
// ---------------------------------------------------------------------------

cartRouter.delete("/items/:productId", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const productId = c.req.param("productId");
  const stub = getCartStub(c.env, userId);
  const doRes = await stub.fetch(
    new Request(`http://cart-do/items/${productId}`, { method: "DELETE" }),
  );
  return proxyDoResponse(doRes);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCartStub(env: Bindings, userId: string) {
  const id = env.CART_DO.idFromName(userId);
  return env.CART_DO.get(id);
}

async function proxyDoResponse(doRes: Response): Promise<Response> {
  const body = await doRes.json() as Record<string, unknown>;
  if (!doRes.ok) {
    const code = typeof body["code"] === "string" ? body["code"] : "CART_ERROR";
    throw { code };
  }
  return Response.json(body, { status: doRes.status });
}
