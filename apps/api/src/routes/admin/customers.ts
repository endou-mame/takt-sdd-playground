import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "../../worker";
import type { AuthVariables } from "../../middleware/authMiddleware";
import { authMiddleware, adminMiddleware } from "../../middleware/authMiddleware";
import {
  handleSearchCustomers,
  handleGetCustomerDetail,
} from "../../application/user/queries/UserQueryHandlers";
import { DrizzleUserRepository } from "../../infrastructure/repository/DrizzleUserRepository";
import { DrizzleAddressRepository } from "../../infrastructure/repository/DrizzleAddressRepository";
import { DrizzleWishlistRepository } from "../../infrastructure/repository/DrizzleWishlistRepository";
import { toValidationErrorResponse } from "../utils";

type AppEnv = { Bindings: Bindings; Variables: AuthVariables };

export const adminCustomersRouter = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ListCustomersQuerySchema = z.object({
  keyword: z.string().optional(),
});

// ---------------------------------------------------------------------------
// GET /admin/customers
// ---------------------------------------------------------------------------

adminCustomersRouter.get("/customers", authMiddleware, adminMiddleware, async (c) => {
  const raw = c.req.query();
  const result = ListCustomersQuerySchema.safeParse(raw);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const ctx = buildQueryContext(c.env);
  const customers = await handleSearchCustomers(result.data.keyword ?? "", ctx);
  return c.json(customers);
});

// ---------------------------------------------------------------------------
// GET /admin/customers/:id
// ---------------------------------------------------------------------------

adminCustomersRouter.get("/customers/:id", authMiddleware, adminMiddleware, async (c) => {
  const userId = c.req.param("id");
  const ctx = buildQueryContext(c.env);
  const detail = await handleGetCustomerDetail(userId, ctx);
  return c.json(detail);
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
