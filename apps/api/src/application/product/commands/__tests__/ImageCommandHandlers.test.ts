import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleUploadImage,
  handleAssociateProductImage,
  type UploadImageCommand,
  type AssociateProductImageCommand,
} from "../ImageCommandHandlers";
import type { EventStore, StoredEvent } from "../../../../infrastructure/event-store/EventStore";
import type { ProductProjection } from "../../../../infrastructure/projection/ProductProjection";
import type { ImageRepository } from "../../../../infrastructure/image/R2ImageRepository";
import type { ProductEvent } from "../../../../domain/product/ProductEvents";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IMAGE_URL = "https://r2.example.com/products/prod-1/some-uuid.jpg";
const VALID_PRODUCT_ID = "00000000-0000-4000-8000-000000000002";
const VALID_CATEGORY_ID = "00000000-0000-4000-8000-000000000001";

function makeEventStore(events: StoredEvent[] = []): EventStore {
  return {
    append: vi.fn().mockResolvedValue(undefined),
    loadEvents: vi.fn().mockResolvedValue(events),
  };
}

function makeProjection(): ProductProjection {
  return { apply: vi.fn().mockResolvedValue(undefined) } as unknown as ProductProjection;
}

function makeImageRepository(url = IMAGE_URL): ImageRepository {
  return {
    upload: vi.fn().mockResolvedValue(url),
  };
}

function makeStoredEvent(payload: ProductEvent, version = 1): StoredEvent {
  return {
    id: crypto.randomUUID(),
    aggregateId: VALID_PRODUCT_ID,
    aggregateType: "product",
    version,
    eventType: payload.type,
    payload,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

function makeProductCreatedEvent(): ProductEvent {
  return {
    type: "ProductCreated",
    productId: VALID_PRODUCT_ID,
    name: "Test",
    description: "Desc",
    price: 1000,
    categoryId: VALID_CATEGORY_ID,
    stock: 5,
  };
}

// ---------------------------------------------------------------------------
// handleUploadImage
// ---------------------------------------------------------------------------

describe("handleUploadImage", () => {
  it("calls imageRepository.upload and returns the imageUrl", async () => {
    const imageRepository = makeImageRepository();
    const cmd: UploadImageCommand = {
      file: new ArrayBuffer(8),
      contentType: "image/jpeg",
    };
    const result = await handleUploadImage(cmd, { imageRepository });
    expect(imageRepository.upload).toHaveBeenCalledOnce();
    expect(result).toEqual({ imageUrl: IMAGE_URL });
  });

  it("uses products/{productId}/{uuid}.jpg key when productId is given", async () => {
    const imageRepository = makeImageRepository();
    const cmd: UploadImageCommand = {
      file: new ArrayBuffer(8),
      contentType: "image/jpeg",
      productId: VALID_PRODUCT_ID,
    };
    await handleUploadImage(cmd, { imageRepository });
    const key = (imageRepository.upload as ReturnType<typeof vi.fn>).mock.calls[0]![2]! as string;
    expect(key).toMatch(new RegExp(`^products/${VALID_PRODUCT_ID}/[\\w-]+\\.jpg$`));
  });

  it("uses products/{uuid}/{uuid}.png key when productId is omitted", async () => {
    const imageRepository = makeImageRepository();
    const cmd: UploadImageCommand = {
      file: new ArrayBuffer(8),
      contentType: "image/png",
    };
    await handleUploadImage(cmd, { imageRepository });
    const key = (imageRepository.upload as ReturnType<typeof vi.fn>).mock.calls[0]![2]! as string;
    expect(key).toMatch(/^products\/[\w-]+\/[\w-]+\.png$/);
  });

  it("maps image/webp content type to .webp extension", async () => {
    const imageRepository = makeImageRepository();
    const cmd: UploadImageCommand = {
      file: new ArrayBuffer(8),
      contentType: "image/webp",
      productId: VALID_PRODUCT_ID,
    };
    await handleUploadImage(cmd, { imageRepository });
    const key = (imageRepository.upload as ReturnType<typeof vi.fn>).mock.calls[0]![2]! as string;
    expect(key).toMatch(/\.webp$/);
  });
});

// ---------------------------------------------------------------------------
// handleAssociateProductImage
// ---------------------------------------------------------------------------

describe("handleAssociateProductImage", () => {
  let eventStore: EventStore;
  let projection: ProductProjection;

  beforeEach(() => {
    eventStore = makeEventStore([makeStoredEvent(makeProductCreatedEvent(), 1)]);
    projection = makeProjection();
  });

  it("throws PRODUCT_NOT_FOUND when no events exist", async () => {
    const emptyStore = makeEventStore([]);
    const cmd: AssociateProductImageCommand = {
      productId: VALID_PRODUCT_ID,
      imageUrl: "https://r2.example.com/img.jpg",
    };
    await expect(
      handleAssociateProductImage(cmd, { eventStore: emptyStore, projection }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("throws IMAGE_LIMIT_EXCEEDED when product already has 10 images", async () => {
    const events: StoredEvent[] = [makeStoredEvent(makeProductCreatedEvent(), 1)];
    for (let i = 0; i < 10; i++) {
      events.push(
        makeStoredEvent(
          {
            type: "ProductImageAssociated",
            productId: VALID_PRODUCT_ID,
            imageUrl: `https://r2.example.com/img${i}.jpg`,
          },
          i + 2,
        ),
      );
    }
    const limitStore = makeEventStore(events);
    const cmd: AssociateProductImageCommand = {
      productId: VALID_PRODUCT_ID,
      imageUrl: "https://r2.example.com/extra.jpg",
    };
    await expect(
      handleAssociateProductImage(cmd, { eventStore: limitStore, projection }),
    ).rejects.toMatchObject({ code: "IMAGE_LIMIT_EXCEEDED" });
  });

  it("appends a ProductImageAssociated event to the event store", async () => {
    const cmd: AssociateProductImageCommand = {
      productId: VALID_PRODUCT_ID,
      imageUrl: "https://r2.example.com/new.jpg",
    };
    await handleAssociateProductImage(cmd, { eventStore, projection });

    expect(eventStore.append).toHaveBeenCalledOnce();
    const appendedEvent = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls[0]![2]![0]!;
    expect(appendedEvent.type).toBe("ProductImageAssociated");
    expect(appendedEvent.payload.imageUrl).toBe("https://r2.example.com/new.jpg");
  });

  it("applies the ProductImageAssociated event to the projection", async () => {
    const cmd: AssociateProductImageCommand = {
      productId: VALID_PRODUCT_ID,
      imageUrl: "https://r2.example.com/new.jpg",
    };
    await handleAssociateProductImage(cmd, { eventStore, projection });

    expect(projection.apply).toHaveBeenCalledOnce();
    const appliedEvent = (projection.apply as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(appliedEvent.type).toBe("ProductImageAssociated");
    expect(appliedEvent.imageUrl).toBe("https://r2.example.com/new.jpg");
  });

  it("throws Zod error for invalid productId", async () => {
    const cmd: AssociateProductImageCommand = {
      productId: "not-a-uuid",
      imageUrl: "https://r2.example.com/img.jpg",
    };
    await expect(
      handleAssociateProductImage(cmd, { eventStore, projection }),
    ).rejects.toThrow();
  });
});
