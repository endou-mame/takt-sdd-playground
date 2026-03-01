import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "../../worker";
import type { AuthVariables } from "../../middleware/authMiddleware";
import { authMiddleware } from "../../middleware/authMiddleware";
import {
  handleCreateAddress,
  handleUpdateAddress,
  handleDeleteAddress,
} from "../../application/user/commands/AddressCommandHandlers";
import { handleGetMyAddresses } from "../../application/user/queries/UserQueryHandlers";
import { DrizzleUserRepository } from "../../infrastructure/repository/DrizzleUserRepository";
import { DrizzleAddressRepository } from "../../infrastructure/repository/DrizzleAddressRepository";
import { DrizzleWishlistRepository } from "../../infrastructure/repository/DrizzleWishlistRepository";
import { toValidationErrorResponse, omitUndefined } from "../utils";

type AppEnv = { Bindings: Bindings; Variables: AuthVariables };

export const addressesRouter = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const CreateAddressSchema = z.object({
  postalCode: z.string(),
  prefecture: z.string(),
  city: z.string(),
  street: z.string(),
  name: z.string(),
  phone: z.string(),
});

const UpdateAddressSchema = z.object({
  postalCode: z.string().optional(),
  prefecture: z.string().optional(),
  city: z.string().optional(),
  street: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
});

// ---------------------------------------------------------------------------
// GET /addresses
// ---------------------------------------------------------------------------

addressesRouter.get("/", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const ctx = buildQueryContext(c.env);
  const addresses = await handleGetMyAddresses(userId, ctx);
  return c.json(addresses);
});

// ---------------------------------------------------------------------------
// POST /addresses
// ---------------------------------------------------------------------------

addressesRouter.post("/", authMiddleware, async (c) => {
  const body = await c.req.json<unknown>();
  const result = CreateAddressSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const userId = c.get("userId");
  const ctx = { addressRepository: new DrizzleAddressRepository(c.env.EVENTS_DB) };
  const { addressId } = await handleCreateAddress({ userId, ...result.data }, ctx);
  return c.json({ addressId }, 201);
});

// ---------------------------------------------------------------------------
// PUT /addresses/:id
// ---------------------------------------------------------------------------

addressesRouter.put("/:id", authMiddleware, async (c) => {
  const body = await c.req.json<unknown>();
  const result = UpdateAddressSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const userId = c.get("userId");
  const addressId = c.req.param("id");
  const ctx = { addressRepository: new DrizzleAddressRepository(c.env.EVENTS_DB) };
  await handleUpdateAddress(omitUndefined({ addressId, requesterId: userId, ...result.data }), ctx);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// DELETE /addresses/:id
// ---------------------------------------------------------------------------

addressesRouter.delete("/:id", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const addressId = c.req.param("id");
  const ctx = { addressRepository: new DrizzleAddressRepository(c.env.EVENTS_DB) };
  await handleDeleteAddress({ addressId, requesterId: userId }, ctx);
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
