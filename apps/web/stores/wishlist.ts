import { defineStore } from "pinia";
import { ref } from "vue";
import { useAuthStore } from "./auth";

export type WishlistItem = {
  readonly id: string;
  readonly productId: string;
  readonly createdAt: string;
};

export const useWishlistStore = defineStore("wishlist", () => {
  const items = ref<readonly WishlistItem[]>([]);

  async function load(): Promise<void> {
    const config = useRuntimeConfig();
    const authStore = useAuthStore();
    const data = await $fetch<WishlistItem[]>(`${config.public.apiBase}/wishlist`, {
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    });
    items.value = data;
  }

  async function add(productId: string): Promise<void> {
    const config = useRuntimeConfig();
    const authStore = useAuthStore();
    await $fetch(`${config.public.apiBase}/wishlist`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
      body: { productId },
    });
    await load();
  }

  async function remove(productId: string): Promise<void> {
    // Optimistic update: remove from local state before API call
    items.value = items.value.filter((item) => item.productId !== productId);
    const config = useRuntimeConfig();
    const authStore = useAuthStore();
    await $fetch(`${config.public.apiBase}/wishlist/${productId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    });
  }

  return { items, load, add, remove };
});
