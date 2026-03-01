type CartEnv = { readonly EVENTS_DB: D1Database };

type CartItem = {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
};

type CartState = { items: CartItem[] };

type ProductStockRow = {
  name: string;
  price: number;
  stock: number;
  stock_status: string;
};

export class CartDurableObject {
  private readonly state: DurableObjectState;
  private readonly env: CartEnv;

  constructor(state: DurableObjectState, env: CartEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    if (method === "GET" && path === "/") {
      return this.getCart();
    }
    if (method === "POST" && path === "/items") {
      return this.addItem(request);
    }
    const productIdMatch = path.match(/^\/items\/([^/]+)$/);
    if (productIdMatch) {
      const productId = productIdMatch[1];
      if (!productId) {
        return new Response("Not Found", { status: 404 });
      }
      if (method === "PUT") {
        return this.updateItem(request, productId);
      }
      if (method === "DELETE") {
        return this.removeItem(productId);
      }
    }
    return new Response("Not Found", { status: 404 });
  }

  private async getCart(): Promise<Response> {
    const stored = await this.state.storage.get<CartState>("cart");
    const state = stored ?? { items: [] };

    // Recalculate totals using current prices from D1
    const itemsWithCurrentPrices = await Promise.all(
      state.items.map(async (item) => {
        const row = await this.env.EVENTS_DB
          .prepare("SELECT price FROM products_rm WHERE id = ?")
          .bind(item.productId)
          .first<{ price: number }>();
        // Use stored price when the product has since been deleted
        const unitPrice = row?.price ?? item.unitPrice;
        return { ...item, unitPrice, subtotal: unitPrice * item.quantity };
      }),
    );

    const total = itemsWithCurrentPrices.reduce((sum, item) => sum + item.subtotal, 0);
    return Response.json({ items: itemsWithCurrentPrices, total });
  }

  private async addItem(request: Request): Promise<Response> {
    const body = await request.json() as { productId: string; quantity: number };
    const { productId, quantity } = body;

    const row = await this.env.EVENTS_DB
      .prepare(
        "SELECT name, price, stock, stock_status FROM products_rm WHERE id = ? AND status = 'PUBLISHED'",
      )
      .bind(productId)
      .first<ProductStockRow>();

    if (!row) {
      return Response.json({ code: "PRODUCT_NOT_FOUND" }, { status: 404 });
    }
    if (row.stock_status === "OUT_OF_STOCK" || row.stock === 0) {
      return Response.json({ code: "OUT_OF_STOCK" }, { status: 409 });
    }

    const stored = await this.state.storage.get<CartState>("cart");
    const state = stored ?? { items: [] };

    const existingItem = state.items.find((i) => i.productId === productId);
    const existingQty = existingItem?.quantity ?? 0;
    const totalQty = existingQty + quantity;

    if (totalQty > row.stock) {
      return Response.json({ code: "INSUFFICIENT_STOCK" }, { status: 409 });
    }

    const newItems: CartItem[] = existingItem
      ? state.items.map((i) =>
          i.productId === productId ? { ...i, quantity: totalQty } : i,
        )
      : [
          ...state.items,
          { productId, productName: row.name, unitPrice: row.price, quantity },
        ];

    await this.state.storage.put("cart", { items: newItems });
    return Response.json({ items: newItems });
  }

  private async updateItem(request: Request, productId: string): Promise<Response> {
    const body = await request.json() as { quantity: number };
    const { quantity } = body;

    if (quantity === 0) {
      return this.removeItem(productId);
    }

    const row = await this.env.EVENTS_DB
      .prepare(
        "SELECT stock, stock_status FROM products_rm WHERE id = ? AND status = 'PUBLISHED'",
      )
      .bind(productId)
      .first<{ stock: number; stock_status: string }>();

    if (!row) {
      return Response.json({ code: "PRODUCT_NOT_FOUND" }, { status: 404 });
    }
    if (row.stock_status === "OUT_OF_STOCK" || row.stock === 0) {
      return Response.json({ code: "OUT_OF_STOCK" }, { status: 409 });
    }
    if (quantity > row.stock) {
      return Response.json({ code: "INSUFFICIENT_STOCK" }, { status: 409 });
    }

    const stored = await this.state.storage.get<CartState>("cart");
    const state = stored ?? { items: [] };

    const newItems = state.items.map((i) =>
      i.productId === productId ? { ...i, quantity } : i,
    );

    await this.state.storage.put("cart", { items: newItems });
    return Response.json({ items: newItems });
  }

  private async removeItem(productId: string): Promise<Response> {
    const stored = await this.state.storage.get<CartState>("cart");
    const state = stored ?? { items: [] };

    const newItems = state.items.filter((i) => i.productId !== productId);
    await this.state.storage.put("cart", { items: newItems });
    return Response.json({ items: newItems });
  }
}
