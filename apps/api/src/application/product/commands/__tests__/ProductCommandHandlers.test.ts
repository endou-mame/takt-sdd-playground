import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleCreateProduct,
  handleUpdateProduct,
  handleDeleteProduct,
  replayProduct,
  type CreateProductCommand,
  type UpdateProductCommand,
  type DeleteProductCommand,
} from "../ProductCommandHandlers";
import type { EventStore, StoredEvent } from "../../../../infrastructure/event-store/EventStore";
import type { ProductProjection } from "../../../../infrastructure/projection/ProductProjection";
import type { ProductEvent } from "../../../../domain/product/ProductEvents";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEventStore(events: StoredEvent[] = []): EventStore {
  return {
    append: vi.fn().mockResolvedValue(undefined),
    loadEvents: vi.fn().mockResolvedValue(events),
  };
}

function makeProjection(): ProductProjection {
  return { apply: vi.fn().mockResolvedValue(undefined) } as unknown as ProductProjection;
}

function makeStoredEvent(payload: ProductEvent, version = 1): StoredEvent {
  return {
    id: crypto.randomUUID(),
    aggregateId: "prod-1",
    aggregateType: "product",
    version,
    eventType: payload.type,
    payload,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

const VALID_CATEGORY_ID = "00000000-0000-4000-8000-000000000001";
const VALID_PRODUCT_ID = "00000000-0000-4000-8000-000000000002";

// ---------------------------------------------------------------------------
// replayProduct
// ---------------------------------------------------------------------------

describe("replayProduct", () => {
  it("returns null for empty event list", () => {
    expect(replayProduct([])).toBeNull();
  });

  it("builds product from ProductCreated event", () => {
    const event: ProductEvent = {
      type: "ProductCreated",
      productId: VALID_PRODUCT_ID,
      name: "Test",
      description: "Desc",
      price: 1000,
      categoryId: VALID_CATEGORY_ID,
      stock: 5,
    };
    const stored = makeStoredEvent(event, 1);
    const result = replayProduct([stored]);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(VALID_PRODUCT_ID);
    expect(result?.name).toBe("Test");
    expect(result?.stock).toBe(5);
    expect(result?.status).toBe("PUBLISHED");
    expect(result?.version).toBe(1);
  });

  it("applies ProductUpdated to change name and price", () => {
    const created: ProductEvent = {
      type: "ProductCreated",
      productId: VALID_PRODUCT_ID,
      name: "Old",
      description: "Desc",
      price: 1000,
      categoryId: VALID_CATEGORY_ID,
      stock: 5,
    };
    const updated: ProductEvent = {
      type: "ProductUpdated",
      productId: VALID_PRODUCT_ID,
      changes: { name: "New", price: 2000 },
    };
    const result = replayProduct([
      makeStoredEvent(created, 1),
      makeStoredEvent(updated, 2),
    ]);
    expect(result?.name).toBe("New");
    expect(result?.price).toBe(2000);
    expect(result?.version).toBe(2);
  });

  it("applies ProductDeleted to set status UNPUBLISHED", () => {
    const created: ProductEvent = {
      type: "ProductCreated",
      productId: VALID_PRODUCT_ID,
      name: "Test",
      description: "Desc",
      price: 1000,
      categoryId: VALID_CATEGORY_ID,
      stock: 5,
    };
    const deleted: ProductEvent = { type: "ProductDeleted", productId: VALID_PRODUCT_ID };
    const result = replayProduct([makeStoredEvent(created, 1), makeStoredEvent(deleted, 2)]);
    expect(result?.status).toBe("UNPUBLISHED");
  });

  it("applies StockUpdated to set stock directly", () => {
    const created: ProductEvent = {
      type: "ProductCreated",
      productId: VALID_PRODUCT_ID,
      name: "Test",
      description: "Desc",
      price: 1000,
      categoryId: VALID_CATEGORY_ID,
      stock: 5,
    };
    const stockUpdated: ProductEvent = {
      type: "StockUpdated",
      productId: VALID_PRODUCT_ID,
      quantity: 20,
    };
    const result = replayProduct([makeStoredEvent(created, 1), makeStoredEvent(stockUpdated, 2)]);
    expect(result?.stock).toBe(20);
  });

  it("clamps StockDecreased at 0", () => {
    const created: ProductEvent = {
      type: "ProductCreated",
      productId: VALID_PRODUCT_ID,
      name: "Test",
      description: "Desc",
      price: 1000,
      categoryId: VALID_CATEGORY_ID,
      stock: 3,
    };
    const decreased: ProductEvent = {
      type: "StockDecreased",
      productId: VALID_PRODUCT_ID,
      quantity: 10,
      orderId: "order-1",
    };
    const result = replayProduct([makeStoredEvent(created, 1), makeStoredEvent(decreased, 2)]);
    expect(result?.stock).toBe(0);
  });

  it("applies StockIncreased to add quantity", () => {
    const created: ProductEvent = {
      type: "ProductCreated",
      productId: VALID_PRODUCT_ID,
      name: "Test",
      description: "Desc",
      price: 1000,
      categoryId: VALID_CATEGORY_ID,
      stock: 3,
    };
    const increased: ProductEvent = {
      type: "StockIncreased",
      productId: VALID_PRODUCT_ID,
      quantity: 7,
      orderId: "order-1",
    };
    const result = replayProduct([makeStoredEvent(created, 1), makeStoredEvent(increased, 2)]);
    expect(result?.stock).toBe(10);
  });

  it("applies ProductImageAssociated to append URL", () => {
    const created: ProductEvent = {
      type: "ProductCreated",
      productId: VALID_PRODUCT_ID,
      name: "Test",
      description: "Desc",
      price: 1000,
      categoryId: VALID_CATEGORY_ID,
      stock: 3,
    };
    const imageAssociated: ProductEvent = {
      type: "ProductImageAssociated",
      productId: VALID_PRODUCT_ID,
      imageUrl: "https://example.com/img.jpg",
    };
    const result = replayProduct([
      makeStoredEvent(created, 1),
      makeStoredEvent(imageAssociated, 2),
    ]);
    expect(result?.imageUrls).toEqual(["https://example.com/img.jpg"]);
  });

  it("ignores ProductImageAssociated when image count is already 10", () => {
    const events: StoredEvent[] = [
      makeStoredEvent({
        type: "ProductCreated",
        productId: VALID_PRODUCT_ID,
        name: "Test",
        description: "Desc",
        price: 1000,
        categoryId: VALID_CATEGORY_ID,
        stock: 1,
      }, 1),
    ];
    for (let i = 0; i < 10; i++) {
      events.push(makeStoredEvent({
        type: "ProductImageAssociated",
        productId: VALID_PRODUCT_ID,
        imageUrl: `https://example.com/img${i}.jpg`,
      }, i + 2));
    }
    // 11th image — should be ignored
    events.push(makeStoredEvent({
      type: "ProductImageAssociated",
      productId: VALID_PRODUCT_ID,
      imageUrl: "https://example.com/img-extra.jpg",
    }, 12));

    const result = replayProduct(events);
    expect(result?.imageUrls).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// handleCreateProduct
// ---------------------------------------------------------------------------

describe("handleCreateProduct", () => {
  let eventStore: EventStore;
  let projection: ProductProjection;

  beforeEach(() => {
    eventStore = makeEventStore();
    projection = makeProjection();
  });

  it("appends a ProductCreated event to the event store", async () => {
    const cmd: CreateProductCommand = {
      name: "Widget",
      description: "A nice widget",
      price: 500,
      categoryId: VALID_CATEGORY_ID,
      stock: 10,
    };
    const result = await handleCreateProduct(cmd, { eventStore, projection });

    expect(result.productId).toBeTypeOf("string");
    expect(eventStore.append).toHaveBeenCalledOnce();
    const appendCall = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(appendCall[1]).toBe("product");
    expect(appendCall[3]).toBe(0); // expectedVersion for new aggregate
    const appendedEvent = appendCall[2]![0]!;
    expect(appendedEvent.type).toBe("ProductCreated");
  });

  it("applies the event to the projection", async () => {
    const cmd: CreateProductCommand = {
      name: "Widget",
      description: "A nice widget",
      price: 500,
      categoryId: VALID_CATEGORY_ID,
      stock: 10,
    };
    await handleCreateProduct(cmd, { eventStore, projection });
    expect(projection.apply).toHaveBeenCalledOnce();
    const appliedEvent = (projection.apply as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(appliedEvent.type).toBe("ProductCreated");
    expect(appliedEvent.name).toBe("Widget");
    expect(appliedEvent.price).toBe(500);
  });

  it("throws Zod error for negative price", async () => {
    const cmd: CreateProductCommand = {
      name: "Widget",
      description: "Desc",
      price: -1,
      categoryId: VALID_CATEGORY_ID,
      stock: 10,
    };
    await expect(handleCreateProduct(cmd, { eventStore, projection })).rejects.toThrow();
  });

  it("throws Zod error for invalid categoryId", async () => {
    const cmd: CreateProductCommand = {
      name: "Widget",
      description: "Desc",
      price: 100,
      categoryId: "not-a-uuid",
      stock: 10,
    };
    await expect(handleCreateProduct(cmd, { eventStore, projection })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleUpdateProduct
// ---------------------------------------------------------------------------

describe("handleUpdateProduct", () => {
  const baseCreatedEvent: ProductEvent = {
    type: "ProductCreated",
    productId: VALID_PRODUCT_ID,
    name: "Original",
    description: "Desc",
    price: 1000,
    categoryId: VALID_CATEGORY_ID,
    stock: 5,
  };

  let eventStore: EventStore;
  let projection: ProductProjection;

  beforeEach(() => {
    eventStore = makeEventStore([makeStoredEvent(baseCreatedEvent, 1)]);
    projection = makeProjection();
  });

  it("appends a ProductUpdated event with changed fields", async () => {
    const cmd: UpdateProductCommand = {
      productId: VALID_PRODUCT_ID,
      name: "Updated",
      price: 2000,
    };
    await handleUpdateProduct(cmd, { eventStore, projection });

    expect(eventStore.append).toHaveBeenCalledOnce();
    const appendedEvent = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls[0]![2]![0]!;
    expect(appendedEvent.type).toBe("ProductUpdated");
    expect(appendedEvent.payload.changes.name).toBe("Updated");
    expect(appendedEvent.payload.changes.price).toBe(2000);
  });

  it("uses the product's current version for optimistic locking", async () => {
    const cmd: UpdateProductCommand = { productId: VALID_PRODUCT_ID, name: "New" };
    await handleUpdateProduct(cmd, { eventStore, projection });

    const appendCall = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(appendCall[3]).toBe(1); // version from the stored event
  });

  it("throws PRODUCT_NOT_FOUND when no events exist", async () => {
    const emptyEventStore = makeEventStore([]);
    const cmd: UpdateProductCommand = { productId: VALID_PRODUCT_ID, name: "New" };
    await expect(
      handleUpdateProduct(cmd, { eventStore: emptyEventStore, projection }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("throws PRODUCT_NOT_FOUND when product is UNPUBLISHED", async () => {
    const deletedStore = makeEventStore([
      makeStoredEvent(baseCreatedEvent, 1),
      makeStoredEvent({ type: "ProductDeleted", productId: VALID_PRODUCT_ID }, 2),
    ]);
    const cmd: UpdateProductCommand = { productId: VALID_PRODUCT_ID, name: "New" };
    await expect(
      handleUpdateProduct(cmd, { eventStore: deletedStore, projection }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("throws Zod error for invalid productId", async () => {
    const cmd: UpdateProductCommand = { productId: "not-a-uuid", name: "New" };
    await expect(handleUpdateProduct(cmd, { eventStore, projection })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleDeleteProduct
// ---------------------------------------------------------------------------

describe("handleDeleteProduct", () => {
  const baseCreatedEvent: ProductEvent = {
    type: "ProductCreated",
    productId: VALID_PRODUCT_ID,
    name: "Test",
    description: "Desc",
    price: 1000,
    categoryId: VALID_CATEGORY_ID,
    stock: 5,
  };

  let eventStore: EventStore;
  let projection: ProductProjection;

  beforeEach(() => {
    eventStore = makeEventStore([makeStoredEvent(baseCreatedEvent, 1)]);
    projection = makeProjection();
  });

  it("appends a ProductDeleted event", async () => {
    const cmd: DeleteProductCommand = { productId: VALID_PRODUCT_ID };
    await handleDeleteProduct(cmd, { eventStore, projection });

    expect(eventStore.append).toHaveBeenCalledOnce();
    const appendedEvent = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls[0]![2]![0]!;
    expect(appendedEvent.type).toBe("ProductDeleted");
  });

  it("applies the event to the projection", async () => {
    const cmd: DeleteProductCommand = { productId: VALID_PRODUCT_ID };
    await handleDeleteProduct(cmd, { eventStore, projection });

    expect(projection.apply).toHaveBeenCalledOnce();
    const appliedEvent = (projection.apply as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(appliedEvent.type).toBe("ProductDeleted");
  });

  it("throws PRODUCT_NOT_FOUND when no events exist", async () => {
    const emptyEventStore = makeEventStore([]);
    const cmd: DeleteProductCommand = { productId: VALID_PRODUCT_ID };
    await expect(
      handleDeleteProduct(cmd, { eventStore: emptyEventStore, projection }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("throws Zod error for invalid productId", async () => {
    const cmd: DeleteProductCommand = { productId: "not-a-uuid" };
    await expect(handleDeleteProduct(cmd, { eventStore, projection })).rejects.toThrow();
  });
});
