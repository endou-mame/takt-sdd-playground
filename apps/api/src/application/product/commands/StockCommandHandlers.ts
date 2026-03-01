import type { EventStore } from "../../../infrastructure/event-store/EventStore";
import type { ProductProjection } from "../../../infrastructure/projection/ProductProjection";
import type { ProductEvent } from "../../../domain/product/ProductEvents";
import { parseProductId, parseStockCount } from "../../../domain/shared/ValueObjects";
import { replayProduct } from "./ProductCommandHandlers";

// ---------------------------------------------------------------------------
// Command type
// ---------------------------------------------------------------------------

export type UpdateStockCommand = {
  readonly productId: string;
  readonly quantity: number;
};

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

type StockCommandContext = {
  readonly eventStore: EventStore;
  readonly projection: ProductProjection;
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleUpdateStock(
  cmd: UpdateStockCommand,
  ctx: StockCommandContext,
): Promise<void> {
  const productId = parseProductId(cmd.productId);
  const newStock = parseStockCount(cmd.quantity);

  const events = await ctx.eventStore.loadEvents(productId);
  const product = replayProduct(events);

  if (!product) {
    throw { code: "PRODUCT_NOT_FOUND" as const };
  }

  const event: ProductEvent = {
    type: "StockUpdated",
    productId: product.id,
    quantity: newStock,
  };

  await ctx.eventStore.append(
    product.id,
    "product",
    [{ type: event.type, payload: event }],
    product.version,
  );
  await ctx.projection.apply(event);
}
