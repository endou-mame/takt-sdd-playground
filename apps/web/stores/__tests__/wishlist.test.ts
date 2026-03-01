import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useWishlistStore } from "../wishlist";
import { useAuthStore } from "../auth";

const mockFetch = vi.fn();
vi.stubGlobal("$fetch", mockFetch);
vi.stubGlobal("useRuntimeConfig", () => ({
  public: { apiBase: "http://localhost:8787" },
}));

describe("useWishlistStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockFetch.mockReset();
    // Set a test access token in the auth store
    const authStore = useAuthStore();
    authStore.$patch({ accessToken: "test-access-token" });
  });

  it("items is empty array in initial state", () => {
    const store = useWishlistStore();
    expect(store.items).toEqual([]);
  });

  describe("load", () => {
    it("fetches wishlist and updates items", async () => {
      const mockItems = [
        { id: "w1", productId: "p1", createdAt: "2024-01-01T00:00:00.000Z" },
        { id: "w2", productId: "p2", createdAt: "2024-01-02T00:00:00.000Z" },
      ];
      mockFetch.mockResolvedValueOnce(mockItems);

      const store = useWishlistStore();
      await store.load();

      expect(store.items).toEqual(mockItems);
    });

    it("calls GET /wishlist with Authorization header", async () => {
      mockFetch.mockResolvedValueOnce([]);

      const store = useWishlistStore();
      await store.load();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8787/wishlist",
        expect.objectContaining({
          headers: { Authorization: "Bearer test-access-token" },
        })
      );
    });
  });

  describe("add", () => {
    it("calls POST /wishlist with productId then reloads items", async () => {
      const updatedItems = [
        { id: "w1", productId: "p1", createdAt: "2024-01-01T00:00:00.000Z" },
      ];
      // First call: POST /wishlist, second call: GET /wishlist (reload)
      mockFetch
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce(updatedItems);

      const store = useWishlistStore();
      await store.add("p1");

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "http://localhost:8787/wishlist",
        expect.objectContaining({
          method: "POST",
          headers: { Authorization: "Bearer test-access-token" },
          body: { productId: "p1" },
        })
      );
      expect(store.items).toEqual(updatedItems);
    });
  });

  describe("remove", () => {
    it("removes item from local state immediately (optimistic update)", async () => {
      const initialItems = [
        { id: "w1", productId: "p1", createdAt: "2024-01-01T00:00:00.000Z" },
        { id: "w2", productId: "p2", createdAt: "2024-01-02T00:00:00.000Z" },
      ];
      mockFetch.mockResolvedValueOnce(initialItems);

      const store = useWishlistStore();
      await store.load();
      expect(store.items).toHaveLength(2);

      mockFetch.mockResolvedValueOnce({ success: true });
      const promise = store.remove("p1");
      // Optimistic: item removed before API call completes
      expect(store.items).toHaveLength(1);
      expect(store.items[0].productId).toBe("p2");

      await promise;
    });

    it("calls DELETE /wishlist/:productId with Authorization header", async () => {
      const initialItems = [
        { id: "w1", productId: "p1", createdAt: "2024-01-01T00:00:00.000Z" },
      ];
      mockFetch
        .mockResolvedValueOnce(initialItems)
        .mockResolvedValueOnce({ success: true });

      const store = useWishlistStore();
      await store.load();
      await store.remove("p1");

      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "http://localhost:8787/wishlist/p1",
        expect.objectContaining({
          method: "DELETE",
          headers: { Authorization: "Bearer test-access-token" },
        })
      );
      expect(store.items).toHaveLength(0);
    });
  });
});
