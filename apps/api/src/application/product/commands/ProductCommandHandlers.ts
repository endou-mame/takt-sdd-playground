import type { EventStore, StoredEvent } from "../../../infrastructure/event-store/EventStore";
import type { ProductProjection } from "../../../infrastructure/projection/ProductProjection";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  updateStock,
  associateImage,
  type Product,
} from "../../../domain/product/Product";
import type { ProductEvent } from "../../../domain/product/ProductEvents";
import {
  parseCategoryId,
  parsePrice,
  parseProductId,
  parseStockCount,
  type CategoryId,
  type Price,
  type ProductId,
  type StockCount,
} from "../../../domain/shared/ValueObjects";

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

export type CreateProductCommand = {
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly categoryId: string;
  readonly stock: number;
};

export type UpdateProductCommand = {
  readonly productId: string;
  readonly name?: string;
  readonly description?: string;
  readonly price?: number;
  readonly categoryId?: string;
};

export type DeleteProductCommand = {
  readonly productId: string;
};

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

type ProductCommandContext = {
  readonly eventStore: EventStore;
  readonly projection: ProductProjection;
};

// ---------------------------------------------------------------------------
// replayProduct helper — exported for use by StockCommandHandlers / ImageCommandHandlers
// ---------------------------------------------------------------------------

export function replayProduct(events: readonly StoredEvent[]): Product | null {
  if (events.length === 0) return null;
  let product: Product | undefined;
  for (const e of events) {
    const payload = e.payload as ProductEvent;
    switch (payload.type) {
      case "ProductCreated":
        product = createProduct({
          id: payload.productId as ProductId,
          name: payload.name,
          description: payload.description,
          price: payload.price as Price,
          categoryId: payload.categoryId as CategoryId,
          stock: payload.stock as StockCount,
        });
        break;
      case "ProductUpdated":
        if (product) {
          product = updateProduct(product, {
            ...(payload.changes.name !== undefined && { name: payload.changes.name }),
            ...(payload.changes.description !== undefined && { description: payload.changes.description }),
            ...(payload.changes.price !== undefined && { price: payload.changes.price as Price }),
            ...(payload.changes.categoryId !== undefined && { categoryId: payload.changes.categoryId as CategoryId }),
          });
        }
        break;
      case "ProductDeleted":
        if (product) product = deleteProduct(product);
        break;
      case "StockUpdated":
        if (product) product = updateStock(product, payload.quantity as StockCount);
        break;
      case "StockDecreased":
        if (product) {
          product = updateStock(
            product,
            Math.max(0, product.stock - payload.quantity) as StockCount,
          );
        }
        break;
      case "StockIncreased":
        if (product) {
          product = updateStock(
            product,
            (product.stock + payload.quantity) as StockCount,
          );
        }
        break;
      case "ProductImageAssociated":
        if (product && product.imageUrls.length < 10) {
          product = associateImage(product, payload.imageUrl);
        }
        break;
    }
  }
  const lastVersion = events[events.length - 1]?.version ?? 0;
  return product ? { ...product, version: lastVersion } : null;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleCreateProduct(
  cmd: CreateProductCommand,
  ctx: ProductCommandContext,
): Promise<{ productId: string }> {
  const price = parsePrice(cmd.price);
  const categoryId = parseCategoryId(cmd.categoryId);
  const stock = parseStockCount(cmd.stock);
  const productId = crypto.randomUUID() as ProductId;

  const product = createProduct({
    id: productId,
    name: cmd.name,
    description: cmd.description,
    price,
    categoryId,
    stock,
  });

  const event: ProductEvent = {
    type: "ProductCreated",
    productId: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    categoryId: product.categoryId,
    stock: product.stock,
  };

  await ctx.eventStore.append(
    product.id,
    "product",
    [{ type: event.type, payload: event }],
    0,
  );
  await ctx.projection.apply(event);

  return { productId: product.id };
}

export async function handleUpdateProduct(
  cmd: UpdateProductCommand,
  ctx: ProductCommandContext,
): Promise<void> {
  const productId = parseProductId(cmd.productId);
  const events = await ctx.eventStore.loadEvents(productId);
  const product = replayProduct(events);

  if (!product || product.status === "UNPUBLISHED") {
    throw { code: "PRODUCT_NOT_FOUND" as const };
  }

  const changes: {
    name?: string;
    description?: string;
    price?: number;
    categoryId?: string;
  } = {};
  if (cmd.name !== undefined) changes.name = cmd.name;
  if (cmd.description !== undefined) changes.description = cmd.description;
  if (cmd.price !== undefined) changes.price = parsePrice(cmd.price);
  if (cmd.categoryId !== undefined) changes.categoryId = parseCategoryId(cmd.categoryId);

  const event: ProductEvent = {
    type: "ProductUpdated",
    productId: product.id,
    changes,
  };

  await ctx.eventStore.append(
    product.id,
    "product",
    [{ type: event.type, payload: event }],
    product.version,
  );
  await ctx.projection.apply(event);
}

export async function handleDeleteProduct(
  cmd: DeleteProductCommand,
  ctx: ProductCommandContext,
): Promise<void> {
  const productId = parseProductId(cmd.productId);
  const events = await ctx.eventStore.loadEvents(productId);
  const product = replayProduct(events);

  if (!product) {
    throw { code: "PRODUCT_NOT_FOUND" as const };
  }

  const event: ProductEvent = {
    type: "ProductDeleted",
    productId: product.id,
  };

  await ctx.eventStore.append(
    product.id,
    "product",
    [{ type: event.type, payload: event }],
    product.version,
  );
  await ctx.projection.apply(event);
}
