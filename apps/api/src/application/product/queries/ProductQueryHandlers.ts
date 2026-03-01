import type {
  ProductReadRepository,
  ProductRow,
  ListProductsFilter,
} from "../../../infrastructure/repository/DrizzleProductRepository";
import type {
  CategoryReadRepository,
  CategoryRow,
} from "../../../infrastructure/repository/DrizzleCategoryRepository";

// ---------------------------------------------------------------------------
// Query types
// ---------------------------------------------------------------------------

export type ListProductsQuery = ListProductsFilter;

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

type ProductQueryContext = {
  readonly productRepository: ProductReadRepository;
  readonly categoryRepository: CategoryReadRepository;
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleListProducts(
  query: ListProductsQuery,
  ctx: ProductQueryContext,
): Promise<{ items: ProductRow[]; total: number }> {
  return ctx.productRepository.listProducts(query);
}

export async function handleGetProduct(
  query: { productId: string },
  ctx: ProductQueryContext,
): Promise<ProductRow> {
  const product = await ctx.productRepository.getProductById(query.productId);
  if (!product) {
    throw { code: "PRODUCT_NOT_FOUND" as const };
  }
  return product;
}

export async function handleListCategories(
  ctx: ProductQueryContext,
): Promise<CategoryRow[]> {
  return ctx.categoryRepository.listCategories();
}
