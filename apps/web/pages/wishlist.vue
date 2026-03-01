<template>
  <div>
    <h1>ウィッシュリスト</h1>
    <p v-if="isLoading">読み込み中...</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <template v-else>
      <ul v-if="wishlistStore.items.length > 0">
        <li v-for="item in wishlistStore.items" :key="item.id">
          <NuxtLink :to="`/products/${item.productId}`">
            商品を見る ({{ item.productId }})
          </NuxtLink>
          <span>追加日: {{ formatDate(item.createdAt) }}</span>
          <button :disabled="removingIds.has(item.productId)" @click="handleRemove(item.productId)">
            削除
          </button>
        </li>
      </ul>
      <p v-else>ウィッシュリストに商品がありません</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useWishlistStore } from "~/stores/wishlist";

definePageMeta({ middleware: "auth" });

const wishlistStore = useWishlistStore();

const isLoading = ref(true);
const errorMessage = ref<string | null>(null);
const removingIds = ref(new Set<string>());

async function loadWishlist(): Promise<void> {
  isLoading.value = true;
  errorMessage.value = null;
  try {
    await wishlistStore.load();
  } catch {
    errorMessage.value = "ウィッシュリストの取得に失敗しました";
  } finally {
    isLoading.value = false;
  }
}

async function handleRemove(productId: string): Promise<void> {
  errorMessage.value = null;
  removingIds.value = new Set([...removingIds.value, productId]);
  try {
    await wishlistStore.remove(productId);
  } catch {
    errorMessage.value = "削除に失敗しました";
  } finally {
    const next = new Set(removingIds.value);
    next.delete(productId);
    removingIds.value = next;
  }
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ja-JP");
}

onMounted(() => {
  loadWishlist();
});
</script>
