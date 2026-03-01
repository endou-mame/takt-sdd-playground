<template>
  <div>
    <h1>カート</h1>
    <p v-if="isLoading">読み込み中...</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <template v-else>
      <template v-if="cartStore.items.length > 0">
        <ul>
          <li v-for="item in cartStore.items" :key="item.productId">
            <span>{{ item.productName }}</span>
            <span>¥{{ item.unitPrice.toLocaleString() }}</span>
            <input
              type="number"
              :value="item.quantity"
              min="0"
              @change="handleQuantityChange(item.productId, $event)"
            />
            <span>小計: ¥{{ (item.unitPrice * item.quantity).toLocaleString() }}</span>
            <button @click="handleRemove(item.productId)">削除</button>
          </li>
        </ul>
        <p>合計: ¥{{ cartStore.subtotal.toLocaleString() }}</p>
        <button @click="navigateTo('/checkout')">チェックアウトへ</button>
      </template>
      <template v-else>
        <p>カートは空です</p>
        <NuxtLink to="/products">商品一覧へ</NuxtLink>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useCartStore } from "~/stores/cart";

definePageMeta({ middleware: "auth" });

const cartStore = useCartStore();

const isLoading = ref(true);
const errorMessage = ref<string | null>(null);

async function loadCart(): Promise<void> {
  try {
    await cartStore.fetchItems();
  } catch {
    errorMessage.value = "カートの取得に失敗しました";
  } finally {
    isLoading.value = false;
  }
}

async function handleQuantityChange(productId: string, event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const quantity = parseInt(input.value, 10);
  if (isNaN(quantity) || quantity < 0) return;
  try {
    if (quantity === 0) {
      await cartStore.removeItem(productId);
    } else {
      await cartStore.updateQuantity(productId, quantity);
    }
  } catch {
    errorMessage.value = "数量の更新に失敗しました";
  }
}

async function handleRemove(productId: string): Promise<void> {
  try {
    await cartStore.removeItem(productId);
  } catch {
    errorMessage.value = "削除に失敗しました";
  }
}

onMounted(() => {
  loadCart();
});
</script>
