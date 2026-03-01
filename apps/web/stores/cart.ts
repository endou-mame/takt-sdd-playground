import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useAuthStore } from "./auth";

export type CartItem = {
  readonly productId: string;
  readonly productName: string;
  readonly unitPrice: number;
  readonly quantity: number;
};

export const useCartStore = defineStore("cart", () => {
  const items = ref<readonly CartItem[]>([]);

  const subtotal = computed(() =>
    items.value.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  );

  async function fetchItems(): Promise<void> {
    const config = useRuntimeConfig();
    const authStore = useAuthStore();
    const data = await $fetch<{ items: CartItem[] }>(`${config.public.apiBase}/cart`, {
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    });
    items.value = data.items;
  }

  async function addItem(productId: string, quantity: number): Promise<void> {
    const config = useRuntimeConfig();
    const authStore = useAuthStore();
    await $fetch(`${config.public.apiBase}/cart/items`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
      body: { productId, quantity },
    });
    await fetchItems();
  }

  async function updateQuantity(productId: string, quantity: number): Promise<void> {
    const config = useRuntimeConfig();
    const authStore = useAuthStore();
    await $fetch(`${config.public.apiBase}/cart/items/${productId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
      body: { quantity },
    });
    await fetchItems();
  }

  async function removeItem(productId: string): Promise<void> {
    const config = useRuntimeConfig();
    const authStore = useAuthStore();
    await $fetch(`${config.public.apiBase}/cart/items/${productId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    });
    await fetchItems();
  }

  function clearCart(): void {
    items.value = [];
  }

  return { items, subtotal, fetchItems, addItem, updateQuantity, removeItem, clearCart };
});
