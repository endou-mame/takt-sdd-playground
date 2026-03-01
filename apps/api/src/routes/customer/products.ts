import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "../../worker";
import type { AuthVariables } from "../../middleware/authMiddleware";
import {
  handleListProducts,
  handleGetProduct,
  handleListCategories,
} from "../../application/product/queries/ProductQueryHandlers";
import { DrizzleProductRepository } from "../../infrastructure/repository/DrizzleProductRepository";
import { DrizzleCategoryRepository } from "../../infrastructure/repository/DrizzleCategoryRepository";
import { toValidationErrorResponse, omitUndefined } from "../utils";

type AppEnv = { Bindings: Bindings; Variables: AuthVariables };

export const productsPublicRouter = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ListProductsQuerySchema = z.object({
  keyword: z.string().optional(),
  categoryId: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});

// ---------------------------------------------------------------------------
// GET /products
// ---------------------------------------------------------------------------

productsPublicRouter.get("/products", async (c) => {
  const raw = c.req.query();
  const result = ListProductsQuerySchema.safeParse(raw);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const ctx = buildQueryContext(c.env);
  const data = await handleListProducts(omitUndefined(result.data), ctx);
  return c.json(data);
});

// ---------------------------------------------------------------------------
// GET /products/:id
// ---------------------------------------------------------------------------

productsPublicRouter.get("/products/:id", async (c) => {
  const productId = c.req.param("id");
  const ctx = buildQueryContext(c.env);
  const product = await handleGetProduct({ productId }, ctx);
  return c.json(product);
});

// ---------------------------------------------------------------------------
// GET /categories
// ---------------------------------------------------------------------------

productsPublicRouter.get("/categories", async (c) => {
  const ctx = buildQueryContext(c.env);
  const categories = await handleListCategories(ctx);
  return c.json(categories);
});

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

function buildQueryContext(env: Bindings) {
  return {
    productRepository: new DrizzleProductRepository(env.EVENTS_DB),
    categoryRepository: new DrizzleCategoryRepository(env.EVENTS_DB),
  };
}
