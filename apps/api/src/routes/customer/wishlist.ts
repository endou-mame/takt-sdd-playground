import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "../../worker";
import type { AuthVariables } from "../../middleware/authMiddleware";
import { authMiddleware } from "../../middleware/authMiddleware";
import {
  handleAddToWishlist,
  handleRemoveFromWishlist,
} from "../../application/user/commands/WishlistCommandHandlers";
import { handleGetMyWishlist } from "../../application/user/queries/UserQueryHandlers";
import { DrizzleUserRepository } from "../../infrastructure/repository/DrizzleUserRepository";
import { DrizzleAddressRepository } from "../../infrastructure/repository/DrizzleAddressRepository";
import { DrizzleWishlistRepository } from "../../infrastructure/repository/DrizzleWishlistRepository";
import { toValidationErrorResponse } from "../utils";

type AppEnv = { Bindings: Bindings; Variables: AuthVariables };

export const wishlistRouter = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const AddToWishlistSchema = z.object({
  productId: z.string(),
});

// ---------------------------------------------------------------------------
// GET /wishlist
// ---------------------------------------------------------------------------

wishlistRouter.get("/", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const ctx = buildQueryContext(c.env);
  const items = await handleGetMyWishlist(userId, ctx);
  return c.json(items);
});

// ---------------------------------------------------------------------------
// POST /wishlist
// ---------------------------------------------------------------------------

wishlistRouter.post("/", authMiddleware, async (c) => {
  const body = await c.req.json<unknown>();
  const result = AddToWishlistSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const userId = c.get("userId");
  const ctx = { wishlistRepository: new DrizzleWishlistRepository(c.env.EVENTS_DB) };
  await handleAddToWishlist({ userId, productId: result.data.productId }, ctx);
  return c.json({ success: true }, 201);
});

// ---------------------------------------------------------------------------
// DELETE /wishlist/:productId
// ---------------------------------------------------------------------------

wishlistRouter.delete("/:productId", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const productId = c.req.param("productId");
  const ctx = { wishlistRepository: new DrizzleWishlistRepository(c.env.EVENTS_DB) };
  await handleRemoveFromWishlist({ userId, productId }, ctx);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

function buildQueryContext(env: Bindings) {
  return {
    userRepository: new DrizzleUserRepository(env.EVENTS_DB),
    addressRepository: new DrizzleAddressRepository(env.EVENTS_DB),
    wishlistRepository: new DrizzleWishlistRepository(env.EVENTS_DB),
  };
}
