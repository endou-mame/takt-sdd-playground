import type { CategoryId, Price, ProductId, StockCount } from "../shared/ValueObjects";

export type ProductStatus = "PUBLISHED" | "UNPUBLISHED";
export type StockStatus = "IN_STOCK" | "OUT_OF_STOCK";

export type Product = {
  readonly id: ProductId;
  readonly name: string;
  readonly description: string;
  readonly price: Price;
  readonly categoryId: CategoryId;
  readonly stock: StockCount;
  readonly stockStatus: StockStatus;
  readonly status: ProductStatus;
  readonly imageUrls: readonly string[];
  readonly version: number;
};

const MAX_IMAGE_COUNT = 10;

export type CreateProductParams = {
  readonly id: ProductId;
  readonly name: string;
  readonly description: string;
  readonly price: Price;
  readonly categoryId: CategoryId;
  readonly stock: StockCount;
};

export function createProduct(params: CreateProductParams): Product {
  return {
    id: params.id,
    name: params.name,
    description: params.description,
    price: params.price,
    categoryId: params.categoryId,
    stock: params.stock,
    stockStatus: params.stock > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
    status: "PUBLISHED",
    imageUrls: [],
    version: 0,
  };
}

export type UpdateProductParams = {
  readonly name?: string;
  readonly description?: string;
  readonly price?: Price;
  readonly categoryId?: CategoryId;
};

export function updateProduct(product: Product, changes: UpdateProductParams): Product {
  return {
    ...product,
    ...changes,
  };
}

export function deleteProduct(product: Product): Product {
  return {
    ...product,
    status: "UNPUBLISHED",
  };
}

export function updateStock(product: Product, newStock: StockCount): Product {
  return {
    ...product,
    stock: newStock,
    stockStatus: newStock > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
  };
}

export function associateImage(product: Product, imageUrl: string): Product {
  if (product.imageUrls.length >= MAX_IMAGE_COUNT) {
    throw new Error("IMAGE_LIMIT_EXCEEDED");
  }
  return {
    ...product,
    imageUrls: [...product.imageUrls, imageUrl],
  };
}
