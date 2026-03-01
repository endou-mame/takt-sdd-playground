<template>
  <div>
    <p v-if="isLoading">読み込み中...</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <template v-else-if="product">
      <h1>{{ product.name }}</h1>
      <img
        v-if="product.imageUrls[0]"
        :src="product.imageUrls[0]"
        :alt="product.name"
        width="400"
      />
      <p>¥{{ product.price.toLocaleString() }}</p>
      <p v-if="product.stockStatus === 'OUT_OF_STOCK'" aria-label="在庫状況">在庫切れ</p>
      <p v-else aria-label="在庫状況">在庫あり</p>
      <p>{{ product.description }}</p>
      <button
        v-if="authStore.user"
        :disabled="isWishlistLoading"
        @click="handleWishlist"
      >
        {{ isInWishlist ? "ウィッシュリストから削除" : "ウィッシュリストに追加" }}
      </button>
      <p v-if="wishlistError" role="alert">{{ wishlistError }}</p>
      <NuxtLink to="/">商品一覧に戻る</NuxtLink>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";
import { useWishlistStore } from "~/stores/wishlist";

type ProductRow = {
  id: string;
  name: string;
  description: string;
  price: number;
  categoryId: string;
  stock: number;
  stockStatus: "IN_STOCK" | "OUT_OF_STOCK";
  status: "PUBLISHED" | "UNPUBLISHED";
  imageUrls: string[];
  createdAt: string;
  updatedAt: string;
};

const route = useRoute();
const router = useRouter();
const config = useRuntimeConfig();
const authStore = useAuthStore();
const wishlistStore = useWishlistStore();

const product = ref<ProductRow | null>(null);
const isLoading = ref(true);
const errorMessage = ref<string | null>(null);
const isWishlistLoading = ref(false);
const wishlistError = ref<string | null>(null);

const isInWishlist = computed(
  () => !!product.value && wishlistStore.items.some((item) => item.productId === product.value!.id)
);

async function fetchProduct(): Promise<void> {
  isLoading.value = true;
  errorMessage.value = null;
  try {
    product.value = await $fetch<ProductRow>(
      `${config.public.apiBase}/products/${route.params.id}`
    );
  } catch (err: unknown) {
    const code = extractErrorCode(err);
    if (code === "PRODUCT_NOT_FOUND") {
      await router.push("/");
      return;
    }
    errorMessage.value = "商品の取得に失敗しました";
  } finally {
    isLoading.value = false;
  }
}

async function handleWishlist(): Promise<void> {
  if (!product.value) return;
  wishlistError.value = null;
  isWishlistLoading.value = true;
  try {
    if (isInWishlist.value) {
      await wishlistStore.remove(product.value.id);
    } else {
      await wishlistStore.add(product.value.id);
    }
  } catch {
    wishlistError.value = "ウィッシュリストの操作に失敗しました";
  } finally {
    isWishlistLoading.value = false;
  }
}

function extractErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { code?: string } }).data;
    return data?.code ?? null;
  }
  return null;
}

onMounted(async () => {
  if (authStore.user) {
    await wishlistStore.load();
  }
  await fetchProduct();
});
</script>
