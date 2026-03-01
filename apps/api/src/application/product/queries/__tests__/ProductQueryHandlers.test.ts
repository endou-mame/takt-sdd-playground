import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleListProducts,
  handleGetProduct,
  handleListCategories,
  type ListProductsQuery,
} from "../ProductQueryHandlers";
import type { ProductReadRepository, ProductRow } from "../../../../infrastructure/repository/DrizzleProductRepository";
import type { CategoryReadRepository, CategoryRow } from "../../../../infrastructure/repository/DrizzleCategoryRepository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProductRepository(
  rows: ProductRow[] = [],
  total = rows.length,
): ProductReadRepository {
  return {
    listProducts: vi.fn().mockResolvedValue({ items: rows, total }),
    getProductById: vi.fn().mockResolvedValue(rows[0] ?? null),
  };
}

function makeCategoryRepository(rows: CategoryRow[] = []): CategoryReadRepository {
  return {
    listCategories: vi.fn().mockResolvedValue(rows),
    existsByName: vi.fn().mockResolvedValue(false),
    existsById: vi.fn().mockResolvedValue(true),
    hasProducts: vi.fn().mockResolvedValue(false),
  };
}

const SAMPLE_PRODUCT: ProductRow = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Widget",
  description: "A test widget",
  price: 1000,
  categoryId: "00000000-0000-4000-8000-000000000002",
  stock: 5,
  stockStatus: "IN_STOCK",
  status: "PUBLISHED",
  imageUrls: [],
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const SAMPLE_CATEGORY: CategoryRow = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Electronics",
  createdAt: "2024-01-01T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// handleListProducts
// ---------------------------------------------------------------------------

describe("handleListProducts", () => {
  let productRepository: ProductReadRepository;
  let categoryRepository: CategoryReadRepository;

  beforeEach(() => {
    productRepository = makeProductRepository([SAMPLE_PRODUCT]);
    categoryRepository = makeCategoryRepository([SAMPLE_CATEGORY]);
  });

  it("delegates to productRepository.listProducts with query filter", async () => {
    const query: ListProductsQuery = {
      keyword: "widget",
      categoryId: "00000000-0000-0000-0000-000000000002",
      minPrice: 500,
      maxPrice: 2000,
      page: 1,
      limit: 10,
    };

    const result = await handleListProducts(query, { productRepository, categoryRepository });

    expect(productRepository.listProducts).toHaveBeenCalledWith(query);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.name).toBe("Widget");
    expect(result.total).toBe(1);
  });

  it("passes empty query to repository for no filters", async () => {
    const query: ListProductsQuery = {};
    await handleListProducts(query, { productRepository, categoryRepository });
    expect(productRepository.listProducts).toHaveBeenCalledWith({});
  });
});

// ---------------------------------------------------------------------------
// handleGetProduct
// ---------------------------------------------------------------------------

describe("handleGetProduct", () => {
  let productRepository: ProductReadRepository;
  let categoryRepository: CategoryReadRepository;

  beforeEach(() => {
    productRepository = makeProductRepository([SAMPLE_PRODUCT]);
    categoryRepository = makeCategoryRepository([SAMPLE_CATEGORY]);
  });

  it("returns the product when found", async () => {
    const result = await handleGetProduct(
      { productId: SAMPLE_PRODUCT.id },
      { productRepository, categoryRepository },
    );

    expect(result).toEqual(SAMPLE_PRODUCT);
    expect(productRepository.getProductById).toHaveBeenCalledWith(SAMPLE_PRODUCT.id);
  });

  it("throws PRODUCT_NOT_FOUND when repository returns null", async () => {
    const emptyRepo = makeProductRepository([]);
    (emptyRepo.getProductById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      handleGetProduct(
        { productId: "00000000-0000-4000-8000-000000000099" },
        { productRepository: emptyRepo, categoryRepository },
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });
});

// ---------------------------------------------------------------------------
// handleListCategories
// ---------------------------------------------------------------------------

describe("handleListCategories", () => {
  let productRepository: ProductReadRepository;
  let categoryRepository: CategoryReadRepository;

  beforeEach(() => {
    productRepository = makeProductRepository();
    categoryRepository = makeCategoryRepository([SAMPLE_CATEGORY]);
  });

  it("delegates to categoryRepository.listCategories", async () => {
    const result = await handleListCategories({ productRepository, categoryRepository });

    expect(categoryRepository.listCategories).toHaveBeenCalledOnce();
    expect(result).toEqual([SAMPLE_CATEGORY]);
  });

  it("returns empty array when no categories exist", async () => {
    const emptyRepo = makeCategoryRepository([]);
    const result = await handleListCategories({
      productRepository,
      categoryRepository: emptyRepo,
    });

    expect(result).toEqual([]);
  });
});
