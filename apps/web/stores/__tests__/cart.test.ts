import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useCartStore } from "../cart";
import { useAuthStore } from "../auth";

const mockFetch = vi.fn();
vi.stubGlobal("$fetch", mockFetch);
vi.stubGlobal("useRuntimeConfig", () => ({
  public: { apiBase: "http://localhost:8787" },
}));

describe("useCartStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockFetch.mockReset();
    const authStore = useAuthStore();
    authStore.$patch({ accessToken: "test-access-token" });
  });

  it("items is empty array in initial state", () => {
    const store = useCartStore();
    expect(store.items).toEqual([]);
  });

  it("subtotal is 0 in initial state", () => {
    const store = useCartStore();
    expect(store.subtotal).toBe(0);
  });

  describe("fetchItems", () => {
    it("fetches cart and updates items", async () => {
      const mockItems = [
        { productId: "p1", productName: "商品1", unitPrice: 1000, quantity: 2 },
        { productId: "p2", productName: "商品2", unitPrice: 500, quantity: 1 },
      ];
      mockFetch.mockResolvedValueOnce({ items: mockItems });

      const store = useCartStore();
      await store.fetchItems();

      expect(store.items).toEqual(mockItems);
    });

    it("calls GET /cart with Authorization header", async () => {
      mockFetch.mockResolvedValueOnce({ items: [] });

      const store = useCartStore();
      await store.fetchItems();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8787/cart",
        expect.objectContaining({
          headers: { Authorization: "Bearer test-access-token" },
        })
      );
    });
  });

  describe("subtotal", () => {
    it("calculates subtotal from items", async () => {
      const mockItems = [
        { productId: "p1", productName: "商品1", unitPrice: 1000, quantity: 2 },
        { productId: "p2", productName: "商品2", unitPrice: 500, quantity: 3 },
      ];
      mockFetch.mockResolvedValueOnce({ items: mockItems });

      const store = useCartStore();
      await store.fetchItems();

      expect(store.subtotal).toBe(3500); // 1000*2 + 500*3
    });
  });

  describe("addItem", () => {
    it("calls POST /cart/items then reloads items", async () => {
      const updatedItems = [
        { productId: "p1", productName: "商品1", unitPrice: 1000, quantity: 1 },
      ];
      mockFetch
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ items: updatedItems });

      const store = useCartStore();
      await store.addItem("p1", 1);

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "http://localhost:8787/cart/items",
        expect.objectContaining({
          method: "POST",
          headers: { Authorization: "Bearer test-access-token" },
          body: { productId: "p1", quantity: 1 },
        })
      );
      expect(store.items).toEqual(updatedItems);
    });
  });

  describe("updateQuantity", () => {
    it("calls PUT /cart/items/:productId then reloads items", async () => {
      const updatedItems = [
        { productId: "p1", productName: "商品1", unitPrice: 1000, quantity: 3 },
      ];
      mockFetch
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ items: updatedItems });

      const store = useCartStore();
      await store.updateQuantity("p1", 3);

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "http://localhost:8787/cart/items/p1",
        expect.objectContaining({
          method: "PUT",
          headers: { Authorization: "Bearer test-access-token" },
          body: { quantity: 3 },
        })
      );
      expect(store.items).toEqual(updatedItems);
    });
  });

  describe("removeItem", () => {
    it("calls DELETE /cart/items/:productId then reloads items", async () => {
      mockFetch
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ items: [] });

      const store = useCartStore();
      await store.removeItem("p1");

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "http://localhost:8787/cart/items/p1",
        expect.objectContaining({
          method: "DELETE",
          headers: { Authorization: "Bearer test-access-token" },
        })
      );
      expect(store.items).toEqual([]);
    });
  });

  describe("clearCart", () => {
    it("resets items to empty array without API call", async () => {
      const mockItems = [
        { productId: "p1", productName: "商品1", unitPrice: 1000, quantity: 1 },
      ];
      mockFetch.mockResolvedValueOnce({ items: mockItems });

      const store = useCartStore();
      await store.fetchItems();
      expect(store.items).toHaveLength(1);

      store.clearCart();
      expect(store.items).toEqual([]);
      // clearCart should not call any API
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("subtotal becomes 0 after clearCart", async () => {
      const mockItems = [
        { productId: "p1", productName: "商品1", unitPrice: 1000, quantity: 2 },
      ];
      mockFetch.mockResolvedValueOnce({ items: mockItems });

      const store = useCartStore();
      await store.fetchItems();
      expect(store.subtotal).toBe(2000);

      store.clearCart();
      expect(store.subtotal).toBe(0);
    });
  });
});
