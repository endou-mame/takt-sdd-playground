import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleUpdateStock, type UpdateStockCommand } from "../StockCommandHandlers";
import type { EventStore, StoredEvent } from "../../../../infrastructure/event-store/EventStore";
import type { ProductProjection } from "../../../../infrastructure/projection/ProductProjection";
import type { ProductEvent } from "../../../../domain/product/ProductEvents";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_PRODUCT_ID = "00000000-0000-4000-8000-000000000002";
const VALID_CATEGORY_ID = "00000000-0000-4000-8000-000000000001";

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

function makeEventStore(events: StoredEvent[]): EventStore {
  return {
    append: vi.fn().mockResolvedValue(undefined),
    loadEvents: vi.fn().mockResolvedValue(events),
  };
}

function makeProjection(): ProductProjection {
  return { apply: vi.fn().mockResolvedValue(undefined) } as unknown as ProductProjection;
}

const baseCreatedEvent: ProductEvent = {
  type: "ProductCreated",
  productId: VALID_PRODUCT_ID,
  name: "Test Product",
  description: "Desc",
  price: 1000,
  categoryId: VALID_CATEGORY_ID,
  stock: 5,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleUpdateStock", () => {
  let eventStore: EventStore;
  let projection: ProductProjection;

  beforeEach(() => {
    eventStore = makeEventStore([makeStoredEvent(baseCreatedEvent, 1)]);
    projection = makeProjection();
  });

  it("appends a StockUpdated event with the new quantity", async () => {
    const cmd: UpdateStockCommand = { productId: VALID_PRODUCT_ID, quantity: 20 };
    await handleUpdateStock(cmd, { eventStore, projection });

    expect(eventStore.append).toHaveBeenCalledOnce();
    const appendCall = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const appendedEvent = appendCall[2]![0]!;
    expect(appendedEvent.type).toBe("StockUpdated");
    expect(appendedEvent.payload.quantity).toBe(20);
  });

  it("uses the product's current version for optimistic locking", async () => {
    const cmd: UpdateStockCommand = { productId: VALID_PRODUCT_ID, quantity: 10 };
    await handleUpdateStock(cmd, { eventStore, projection });

    const appendCall = (eventStore.append as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(appendCall[3]).toBe(1);
  });

  it("applies the event to the projection", async () => {
    const cmd: UpdateStockCommand = { productId: VALID_PRODUCT_ID, quantity: 0 };
    await handleUpdateStock(cmd, { eventStore, projection });

    expect(projection.apply).toHaveBeenCalledOnce();
    const appliedEvent = (projection.apply as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(appliedEvent.type).toBe("StockUpdated");
    expect(appliedEvent.quantity).toBe(0);
  });

  it("throws PRODUCT_NOT_FOUND when no events exist", async () => {
    const emptyStore = makeEventStore([]);
    const cmd: UpdateStockCommand = { productId: VALID_PRODUCT_ID, quantity: 5 };
    await expect(
      handleUpdateStock(cmd, { eventStore: emptyStore, projection }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("throws Zod error for negative quantity", async () => {
    const cmd: UpdateStockCommand = { productId: VALID_PRODUCT_ID, quantity: -1 };
    await expect(handleUpdateStock(cmd, { eventStore, projection })).rejects.toThrow();
  });

  it("throws Zod error for invalid productId", async () => {
    const cmd: UpdateStockCommand = { productId: "not-a-uuid", quantity: 5 };
    await expect(handleUpdateStock(cmd, { eventStore, projection })).rejects.toThrow();
  });

  it("accepts quantity 0 (sets stock to OUT_OF_STOCK)", async () => {
    const cmd: UpdateStockCommand = { productId: VALID_PRODUCT_ID, quantity: 0 };
    await expect(handleUpdateStock(cmd, { eventStore, projection })).resolves.toBeUndefined();
  });
});
