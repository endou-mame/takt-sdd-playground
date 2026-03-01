import type { EventStore } from "../../../infrastructure/event-store/EventStore";
import type { ProductProjection } from "../../../infrastructure/projection/ProductProjection";
import type { ImageRepository } from "../../../infrastructure/image/R2ImageRepository";
import type { ProductEvent } from "../../../domain/product/ProductEvents";
import { parseProductId } from "../../../domain/shared/ValueObjects";
import { replayProduct } from "./ProductCommandHandlers";

// Map of supported MIME types to file extensions.
// R2ImageRepository validates the content type and throws UNSUPPORTED_IMAGE_FORMAT
// for types not in this list, so the extension lookup will always succeed in practice.
const CONTENT_TYPE_TO_EXT = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

export type UploadImageCommand = {
  readonly file: ArrayBuffer;
  readonly contentType: string;
  /** When provided, the key is scoped under this product's folder. */
  readonly productId?: string;
};

export type AssociateProductImageCommand = {
  readonly productId: string;
  readonly imageUrl: string;
};

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

type UploadImageContext = {
  readonly imageRepository: ImageRepository;
};

type AssociateImageContext = {
  readonly eventStore: EventStore;
  readonly projection: ProductProjection;
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleUploadImage(
  cmd: UploadImageCommand,
  ctx: UploadImageContext,
): Promise<{ imageUrl: string }> {
  const ext = CONTENT_TYPE_TO_EXT.get(cmd.contentType) ?? "bin";
  const baseId = cmd.productId ?? crypto.randomUUID();
  const key = `products/${baseId}/${crypto.randomUUID()}.${ext}`;

  const imageUrl = await ctx.imageRepository.upload(cmd.file, cmd.contentType, key);
  return { imageUrl };
}

export async function handleAssociateProductImage(
  cmd: AssociateProductImageCommand,
  ctx: AssociateImageContext,
): Promise<void> {
  const productId = parseProductId(cmd.productId);
  const events = await ctx.eventStore.loadEvents(productId);
  const product = replayProduct(events);

  if (!product) {
    throw { code: "PRODUCT_NOT_FOUND" as const };
  }

  if (product.imageUrls.length >= 10) {
    throw { code: "IMAGE_LIMIT_EXCEEDED" as const };
  }

  const event: ProductEvent = {
    type: "ProductImageAssociated",
    productId: product.id,
    imageUrl: cmd.imageUrl,
  };

  await ctx.eventStore.append(
    product.id,
    "product",
    [{ type: event.type, payload: event }],
    product.version,
  );
  await ctx.projection.apply(event);
}
