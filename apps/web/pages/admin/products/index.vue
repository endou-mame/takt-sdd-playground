<template>
  <div>
    <h1>商品管理</h1>
    <NuxtLink to="/admin/products/new">新規追加</NuxtLink>

    <p v-if="isLoading">読み込み中...</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <table v-else-if="products.length > 0">
      <thead>
        <tr>
          <th>商品名</th>
          <th>価格</th>
          <th>在庫数</th>
          <th>在庫状況</th>
          <th>ステータス</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="product in products" :key="product.productId">
          <td>{{ product.name }}</td>
          <td>¥{{ product.price.toLocaleString() }}</td>
          <td>{{ product.stockQuantity }}</td>
          <td>{{ translateStockStatus(product.stockStatus) }}</td>
          <td>{{ translatePublishStatus(product.status) }}</td>
          <td>
            <NuxtLink :to="`/admin/products/${product.productId}`">編集</NuxtLink>
            <button @click="handleDelete(product.productId)">削除</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else>商品がありません</p>

    <div>
      <button :disabled="page <= 1" @click="changePage(page - 1)">前へ</button>
      <span>{{ page }} ページ</span>
      <button :disabled="products.length < limit" @click="changePage(page + 1)">次へ</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

definePageMeta({ middleware: "admin" });

type ProductRow = {
  productId: string;
  name: string;
  price: number;
  stockQuantity: number;
  stockStatus: string;
  status: string;
};

const authStore = useAuthStore();
const config = useRuntimeConfig();

const products = ref<ProductRow[]>([]);
const isLoading = ref(true);
const errorMessage = ref<string | null>(null);
const page = ref(1);
const limit = 20;

async function fetchProducts(): Promise<void> {
  isLoading.value = true;
  errorMessage.value = null;
  try {
    const params = new URLSearchParams({ page: String(page.value), limit: String(limit) });
    const data = await $fetch<ProductRow[]>(
      `${config.public.apiBase}/products?${params.toString()}`,
      { headers: { Authorization: `Bearer ${authStore.accessToken}` } }
    );
    products.value = data;
  } catch {
    errorMessage.value = "商品一覧の取得に失敗しました";
  } finally {
    isLoading.value = false;
  }
}

async function handleDelete(productId: string): Promise<void> {
  if (!confirm("この商品を削除してよろしいですか？")) return;
  try {
    await $fetch(`${config.public.apiBase}/admin/products/${productId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    });
    await fetchProducts();
  } catch {
    errorMessage.value = "商品の削除に失敗しました";
  }
}

async function changePage(newPage: number): Promise<void> {
  page.value = newPage;
  await fetchProducts();
}

function translateStockStatus(status: string): string {
  return status === "IN_STOCK" ? "在庫あり" : "在庫なし";
}

function translatePublishStatus(status: string): string {
  return status === "PUBLISHED" ? "公開中" : "非公開";
}

onMounted(() => {
  fetchProducts();
});
</script>
