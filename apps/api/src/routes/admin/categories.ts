import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "../../worker";
import type { AuthVariables } from "../../middleware/authMiddleware";
import { authMiddleware, adminMiddleware } from "../../middleware/authMiddleware";
import {
  handleCreateCategory,
  handleDeleteCategory,
} from "../../application/product/commands/CategoryCommandHandlers";
import { handleListCategories } from "../../application/product/queries/ProductQueryHandlers";
import { DrizzleCategoryRepository } from "../../infrastructure/repository/DrizzleCategoryRepository";
import { DrizzleProductRepository } from "../../infrastructure/repository/DrizzleProductRepository";
import { toValidationErrorResponse } from "../utils";

type AppEnv = { Bindings: Bindings; Variables: AuthVariables };

export const adminCategoriesRouter = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const CreateCategorySchema = z.object({
  name: z.string(),
});

// ---------------------------------------------------------------------------
// GET /admin/categories
// ---------------------------------------------------------------------------

adminCategoriesRouter.get("/categories", authMiddleware, adminMiddleware, async (c) => {
  const ctx = {
    productRepository: new DrizzleProductRepository(c.env.EVENTS_DB),
    categoryRepository: new DrizzleCategoryRepository(c.env.EVENTS_DB),
  };
  const categories = await handleListCategories(ctx);
  return c.json(categories);
});

// ---------------------------------------------------------------------------
// POST /admin/categories
// ---------------------------------------------------------------------------

adminCategoriesRouter.post("/categories", authMiddleware, adminMiddleware, async (c) => {
  const body = await c.req.json<unknown>();
  const result = CreateCategorySchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }
  const ctx = { categoryRepository: new DrizzleCategoryRepository(c.env.EVENTS_DB) };
  const { categoryId } = await handleCreateCategory(result.data, ctx);
  return c.json({ categoryId }, 201);
});

// ---------------------------------------------------------------------------
// DELETE /admin/categories/:id
// ---------------------------------------------------------------------------

adminCategoriesRouter.delete("/categories/:id", authMiddleware, adminMiddleware, async (c) => {
  const categoryId = c.req.param("id");
  const ctx = { categoryRepository: new DrizzleCategoryRepository(c.env.EVENTS_DB) };
  await handleDeleteCategory({ categoryId }, ctx);
  return c.json({ success: true });
});
