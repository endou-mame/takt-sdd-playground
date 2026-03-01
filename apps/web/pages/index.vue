<template>
  <div>
    <h1>商品一覧</h1>

    <form @submit.prevent="applyFilter">
      <div>
        <label for="keyword">キーワード</label>
        <input id="keyword" v-model="filterKeyword" type="text" placeholder="商品名・説明で検索" />
      </div>
      <div>
        <label for="category">カテゴリ</label>
        <select id="category" v-model="filterCategoryId">
          <option value="">すべて</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">
            {{ cat.name }}
          </option>
        </select>
      </div>
      <div>
        <label for="minPrice">最低価格</label>
        <input id="minPrice" v-model="filterMinPrice" type="number" min="0" placeholder="0" />
      </div>
      <div>
        <label for="maxPrice">最高価格</label>
        <input id="maxPrice" v-model="filterMaxPrice" type="number" min="0" placeholder="上限なし" />
      </div>
      <button type="submit">絞り込む</button>
    </form>

    <p v-if="isLoading">読み込み中...</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <template v-else>
      <ul v-if="products.length > 0">
        <li
          v-for="product in products"
          :key="product.id"
          :style="product.stockStatus === 'OUT_OF_STOCK' ? { opacity: '0.5' } : {}"
        >
          <NuxtLink :to="`/products/${product.id}`">
            <img
              v-if="product.imageUrls[0]"
              :src="product.imageUrls[0]"
              :alt="product.name"
              width="200"
            />
            <p>{{ product.name }}</p>
            <p>¥{{ product.price.toLocaleString() }}</p>
            <p v-if="product.stockStatus === 'OUT_OF_STOCK'">在庫切れ</p>
          </NuxtLink>
        </li>
      </ul>
      <p v-else>商品が見つかりませんでした</p>

      <nav v-if="totalPages > 1" aria-label="ページネーション">
        <button :disabled="currentPage <= 1" @click="changePage(currentPage - 1)">前へ</button>
        <span>{{ currentPage }} / {{ totalPages }} ページ</span>
        <button :disabled="currentPage >= totalPages" @click="changePage(currentPage + 1)">次へ</button>
      </nav>
    </template>
  </div>
</template>

<script setup lang="ts">
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

type CategoryRow = {
  id: string;
  name: string;
};

type ProductsResponse = {
  items: ProductRow[];
  total: number;
};

const LIMIT = 20;

const route = useRoute();
const router = useRouter();
const config = useRuntimeConfig();

const filterKeyword = ref(String(route.query.keyword ?? ""));
const filterCategoryId = ref(String(route.query.categoryId ?? ""));
const filterMinPrice = ref(String(route.query.minPrice ?? ""));
const filterMaxPrice = ref(String(route.query.maxPrice ?? ""));

const products = ref<ProductRow[]>([]);
const total = ref(0);
const categories = ref<CategoryRow[]>([]);
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);

const currentPage = computed(() => Number(route.query.page ?? 1));
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / LIMIT)));

async function fetchCategories(): Promise<void> {
  const data = await $fetch<CategoryRow[]>(`${config.public.apiBase}/categories`);
  categories.value = data;
}

async function fetchProducts(): Promise<void> {
  isLoading.value = true;
  errorMessage.value = null;
  try {
    const params = new URLSearchParams();
    const q = route.query;
    if (q.keyword) params.set("keyword", String(q.keyword));
    if (q.categoryId) params.set("categoryId", String(q.categoryId));
    if (q.minPrice) params.set("minPrice", String(q.minPrice));
    if (q.maxPrice) params.set("maxPrice", String(q.maxPrice));
    params.set("page", String(currentPage.value));
    params.set("limit", String(LIMIT));

    const data = await $fetch<ProductsResponse>(
      `${config.public.apiBase}/products?${params.toString()}`
    );
    products.value = data.items;
    total.value = data.total;
  } catch {
    errorMessage.value = "商品の取得に失敗しました";
  } finally {
    isLoading.value = false;
  }
}

function applyFilter(): void {
  const query: Record<string, string> = { page: "1" };
  if (filterKeyword.value) query.keyword = filterKeyword.value;
  if (filterCategoryId.value) query.categoryId = filterCategoryId.value;
  if (filterMinPrice.value) query.minPrice = filterMinPrice.value;
  if (filterMaxPrice.value) query.maxPrice = filterMaxPrice.value;
  router.push({ query });
}

function changePage(newPage: number): void {
  router.push({ query: { ...route.query, page: String(newPage) } });
}

watchEffect(() => {
  fetchProducts();
});

onMounted(() => {
  fetchCategories();
});
</script>
