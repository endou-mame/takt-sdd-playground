import { createCategory } from "../../../domain/category/Category";
import { parseCategoryId, type CategoryId } from "../../../domain/shared/ValueObjects";

// ---------------------------------------------------------------------------
// CategoryRepository port — implemented by DrizzleCategoryRepository
// ---------------------------------------------------------------------------

export interface CategoryRepository {
  existsByName(name: string): Promise<boolean>;
  existsById(categoryId: string): Promise<boolean>;
  hasProducts(categoryId: string): Promise<boolean>;
  create(id: string, name: string): Promise<void>;
  deleteById(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

export type CreateCategoryCommand = {
  readonly name: string;
};

export type DeleteCategoryCommand = {
  readonly categoryId: string;
};

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

type CategoryCommandContext = {
  readonly categoryRepository: CategoryRepository;
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleCreateCategory(
  cmd: CreateCategoryCommand,
  ctx: CategoryCommandContext,
): Promise<{ categoryId: string }> {
  const id = crypto.randomUUID() as CategoryId;
  // createCategory validates domain invariants: name length 1–100 chars
  const category = createCategory({ id, name: cmd.name });

  const exists = await ctx.categoryRepository.existsByName(category.name);
  if (exists) {
    throw { code: "CATEGORY_NAME_CONFLICT" as const };
  }

  await ctx.categoryRepository.create(category.id, category.name);
  return { categoryId: category.id };
}

export async function handleDeleteCategory(
  cmd: DeleteCategoryCommand,
  ctx: CategoryCommandContext,
): Promise<void> {
  const categoryId = parseCategoryId(cmd.categoryId);

  const exists = await ctx.categoryRepository.existsById(categoryId);
  if (!exists) {
    throw { code: "CATEGORY_NOT_FOUND" as const };
  }

  const hasProducts = await ctx.categoryRepository.hasProducts(categoryId);
  if (hasProducts) {
    throw { code: "CATEGORY_HAS_PRODUCTS" as const };
  }

  await ctx.categoryRepository.deleteById(categoryId);
}
