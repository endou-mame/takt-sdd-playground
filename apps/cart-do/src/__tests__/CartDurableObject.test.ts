/**
 * Unit tests for CartDurableObject using in-memory mocks for
 * DurableObjectState.storage and D1Database.
 *
 * Cloudflare Workers types are available via @cloudflare/workers-types but
 * the actual bindings are simulated with lightweight in-memory implementations.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { CartDurableObject } from "../CartDurableObject";

// ---------------------------------------------------------------------------
// DurableObjectStorage mock
// ---------------------------------------------------------------------------

function createStorageMock(): Pick<DurableObjectStorage, "get" | "put"> {
  const store = new Map<string, unknown>();
  return {
    get: async <T>(key: string): Promise<T | undefined> =>
      store.get(key) as T | undefined,
    put: async (key: string, value: unknown): Promise<void> => {
      store.set(key, value);
    },
  };
}

// ---------------------------------------------------------------------------
// D1Database mock
// ---------------------------------------------------------------------------

type MockProduct = {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly stock: number;
  readonly stock_status: string;
  readonly status: string;
};

const EMPTY_META: D1ResponseMeta = {
  duration: 0,
  size_after: 0,
  rows_read: 0,
  rows_written: 0,
  last_row_id: 0,
  changed_db: false,
  changes: 0,
};

function createD1Mock(products: MockProduct[]): D1Database {
  function makeStatement(sql: string, params: unknown[]): D1PreparedStatement {
    const stmt: {
      bind(...values: unknown[]): D1PreparedStatement;
      first<T>(): Promise<T | null>;
      run<T>(): Promise<D1Result<T>>;
      all<T>(): Promise<D1Result<T>>;
      raw<T>(): Promise<T[]>;
    } = {
      bind(...values: unknown[]): D1PreparedStatement {
        return makeStatement(sql, values);
      },

      async first<T>(): Promise<T | null> {
        const productId = params[0] as string;
        const lower = sql.toLowerCase();
        const requiresPublished = lower.includes("status = 'published'");
        const product = products.find(
          (p) =>
            p.id === productId &&
            (!requiresPublished || p.status === "PUBLISHED"),
        );
        if (!product) return null;
        return product as unknown as T;
      },

      async run<T>(): Promise<D1Result<T>> {
        return { success: true, results: [] as T[], meta: EMPTY_META };
      },

      async all<T>(): Promise<D1Result<T>> {
        return { success: true, results: [] as T[], meta: EMPTY_META };
      },

      raw<T>(): Promise<T[]> {
        throw new Error("raw() not implemented in CartDurableObject mock");
      },
    };
    return stmt as unknown as D1PreparedStatement;
  }

  return {
    prepare(query: string): D1PreparedStatement {
      return makeStatement(query, []);
    },
    batch<T>(): Promise<D1Result<T>[]> {
      throw new Error("batch() not implemented");
    },
    exec(): Promise<D1ExecResult> {
      throw new Error("exec() not implemented");
    },
    withSession(): D1DatabaseSession {
      throw new Error("withSession() not implemented");
    },
    dump(): Promise<ArrayBuffer> {
      throw new Error("dump() not implemented");
    },
  } as unknown as D1Database;
}

// ---------------------------------------------------------------------------
// Helper to create a CartDurableObject with fresh mocks
// ---------------------------------------------------------------------------

function makeCart(products: MockProduct[]) {
  const storage = createStorageMock();
  const mockState = { storage } as unknown as DurableObjectState;
  const mockEnv = { EVENTS_DB: createD1Mock(products) };
  return new CartDurableObject(mockState, mockEnv);
}

const IN_STOCK_PRODUCT: MockProduct = {
  id: "product-1",
  name: "Widget",
  price: 500,
  stock: 10,
  stock_status: "IN_STOCK",
  status: "PUBLISHED",
};

const OUT_OF_STOCK_PRODUCT: MockProduct = {
  id: "product-2",
  name: "Gadget",
  price: 1200,
  stock: 0,
  stock_status: "OUT_OF_STOCK",
  status: "PUBLISHED",
};

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

describe("GET /", () => {
  it("returns empty cart with total 0 when no items are in the cart", async () => {
    const cart = makeCart([IN_STOCK_PRODUCT]);
    const res = await cart.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; total: number };
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("returns items with current D1 price and recalculated total", async () => {
    // Add item first, then GET to verify total is based on D1 current price
    const cart = makeCart([IN_STOCK_PRODUCT]);

    await cart.fetch(
      new Request("http://localhost/items", {
        method: "POST",
        body: JSON.stringify({ productId: "product-1", quantity: 2 }),
      }),
    );

    const res = await cart.fetch(new Request("http://localhost/"));
    const body = await res.json() as { items: Array<{ subtotal: number; unitPrice: number }>; total: number };
    expect(body.items).toHaveLength(1);
    // D1 price is 500, quantity 2 → total = 1000
    expect(body.total).toBe(1000);
    expect(body.items[0]?.unitPrice).toBe(500);
    expect(body.items[0]?.subtotal).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// POST /items
// ---------------------------------------------------------------------------

describe("POST /items", () => {
  it("adds item successfully when product is in stock", async () => {
    const cart = makeCart([IN_STOCK_PRODUCT]);
    const res = await cart.fetch(
      new Request("http://localhost/items", {
        method: "POST",
        body: JSON.stringify({ productId: "product-1", quantity: 3 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ productId: string; quantity: number }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.productId).toBe("product-1");
    expect(body.items[0]?.quantity).toBe(3);
  });

  it("returns 409 OUT_OF_STOCK when product has no stock", async () => {
    const cart = makeCart([OUT_OF_STOCK_PRODUCT]);
    const res = await cart.fetch(
      new Request("http://localhost/items", {
        method: "POST",
        body: JSON.stringify({ productId: "product-2", quantity: 1 }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("OUT_OF_STOCK");
  });

  it("returns 404 PRODUCT_NOT_FOUND when product does not exist", async () => {
    const cart = makeCart([]);
    const res = await cart.fetch(
      new Request("http://localhost/items", {
        method: "POST",
        body: JSON.stringify({ productId: "nonexistent", quantity: 1 }),
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("returns 409 INSUFFICIENT_STOCK when requested quantity exceeds stock", async () => {
    const cart = makeCart([IN_STOCK_PRODUCT]); // stock = 10
    const res = await cart.fetch(
      new Request("http://localhost/items", {
        method: "POST",
        body: JSON.stringify({ productId: "product-1", quantity: 11 }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("INSUFFICIENT_STOCK");
  });
});

// ---------------------------------------------------------------------------
// PUT /items/:productId
// ---------------------------------------------------------------------------

describe("PUT /items/:productId", () => {
  let cart: CartDurableObject;

  beforeEach(async () => {
    cart = makeCart([IN_STOCK_PRODUCT]);
    // Seed: add product-1 with quantity 2
    await cart.fetch(
      new Request("http://localhost/items", {
        method: "POST",
        body: JSON.stringify({ productId: "product-1", quantity: 2 }),
      }),
    );
  });

  it("updates item quantity", async () => {
    const res = await cart.fetch(
      new Request("http://localhost/items/product-1", {
        method: "PUT",
        body: JSON.stringify({ quantity: 5 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ productId: string; quantity: number }> };
    expect(body.items[0]?.quantity).toBe(5);
  });

  it("removes item when quantity = 0", async () => {
    const res = await cart.fetch(
      new Request("http://localhost/items/product-1", {
        method: "PUT",
        body: JSON.stringify({ quantity: 0 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DELETE /items/:productId
// ---------------------------------------------------------------------------

describe("DELETE /items/:productId", () => {
  it("removes only the targeted product and leaves others intact", async () => {
    const secondProduct: MockProduct = {
      id: "product-3",
      name: "Second Item",
      price: 200,
      stock: 5,
      stock_status: "IN_STOCK",
      status: "PUBLISHED",
    };
    const cart = makeCart([IN_STOCK_PRODUCT, secondProduct]);

    await cart.fetch(
      new Request("http://localhost/items", {
        method: "POST",
        body: JSON.stringify({ productId: "product-1", quantity: 1 }),
      }),
    );
    await cart.fetch(
      new Request("http://localhost/items", {
        method: "POST",
        body: JSON.stringify({ productId: "product-3", quantity: 2 }),
      }),
    );

    const res = await cart.fetch(
      new Request("http://localhost/items/product-1", { method: "DELETE" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ productId: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.productId).toBe("product-3");
  });
});

// ---------------------------------------------------------------------------
// Concurrent write simulation
// ---------------------------------------------------------------------------

describe("sequential addItem accumulates quantity (Durable Object single-thread model)", () => {
  it("correctly accumulates quantity across multiple addItem calls on the same instance", async () => {
    const cart = makeCart([IN_STOCK_PRODUCT]); // stock = 10

    // Sequential calls to the same DO instance — simulates the single-threaded
    // Durable Object model where each request is processed one at a time.
    await cart.fetch(
      new Request("http://localhost/items", {
        method: "POST",
        body: JSON.stringify({ productId: "product-1", quantity: 3 }),
      }),
    );
    await cart.fetch(
      new Request("http://localhost/items", {
        method: "POST",
        body: JSON.stringify({ productId: "product-1", quantity: 4 }),
      }),
    );

    const res = await cart.fetch(new Request("http://localhost/"));
    const body = await res.json() as { items: Array<{ productId: string; quantity: number }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.quantity).toBe(7); // 3 + 4
  });
});
