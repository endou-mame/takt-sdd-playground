<template>
  <div>
    <h1>商品編集</h1>
    <p v-if="isLoading">読み込み中...</p>
    <p v-else-if="loadError" role="alert">{{ loadError }}</p>
    <template v-else-if="product">
      <section>
        <h2>商品情報</h2>
        <form @submit.prevent="handleUpdateProduct">
          <div><label>商品名<input v-model="productForm.name" required /></label></div>
          <div><label>説明<textarea v-model="productForm.description" required></textarea></label></div>
          <div><label>価格（円）<input v-model.number="productForm.price" type="number" min="0" required /></label></div>
          <div>
            <label>
              カテゴリ
              <select v-model="productForm.categoryId" required>
                <option v-for="cat in categories" :key="cat.categoryId" :value="cat.categoryId">{{ cat.name }}</option>
              </select>
            </label>
          </div>
          <p v-if="productError" role="alert">{{ productError }}</p>
          <p v-if="productSuccess">{{ productSuccess }}</p>
          <button type="submit" :disabled="isSubmittingProduct">更新する</button>
        </form>
      </section>

      <section>
        <h2>在庫更新</h2>
        <p>現在の在庫数: {{ product.stockQuantity }}</p>
        <form @submit.prevent="handleUpdateStock">
          <label>新しい在庫数<input v-model.number="stockQuantity" type="number" min="0" required /></label>
          <p v-if="stockError" role="alert">{{ stockError }}</p>
          <button type="submit" :disabled="isSubmittingStock">在庫を更新する</button>
        </form>
      </section>

      <section>
        <h2>画像管理</h2>
        <ul v-if="product.imageUrls.length > 0">
          <li v-for="url in product.imageUrls" :key="url">
            <img :src="url" alt="商品画像" style="max-width: 200px;" />
          </li>
        </ul>
        <p v-else>画像がありません</p>
        <div>
          <label>画像ファイル<input type="file" accept="image/*" @change="onFileChange" /></label>
          <p v-if="imageError" role="alert">{{ imageError }}</p>
          <button type="button" :disabled="!selectedFile || isUploadingImage" @click="handleUploadImage">
            アップロードして関連付ける
          </button>
        </div>
      </section>
    </template>
    <NuxtLink to="/admin/products">商品一覧に戻る</NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

definePageMeta({ middleware: "admin" });

type CategoryRow = { categoryId: string; name: string };

type ProductDetail = {
  productId: string;
  name: string;
  description: string;
  price: number;
  categoryId: string;
  stockQuantity: number;
  imageUrls: string[];
};

type ProductForm = { name: string; description: string; price: number; categoryId: string };

const authStore = useAuthStore();
const config = useRuntimeConfig();
const route = useRoute();

const product = ref<ProductDetail | null>(null);
const categories = ref<CategoryRow[]>([]);
const isLoading = ref(true);
const loadError = ref<string | null>(null);

const productForm = ref<ProductForm>({ name: "", description: "", price: 0, categoryId: "" });
const isSubmittingProduct = ref(false);
const productError = ref<string | null>(null);
const productSuccess = ref<string | null>(null);

const stockQuantity = ref(0);
const isSubmittingStock = ref(false);
const stockError = ref<string | null>(null);

const selectedFile = ref<File | null>(null);
const isUploadingImage = ref(false);
const imageError = ref<string | null>(null);

async function fetchProduct(): Promise<void> {
  const data = await $fetch<ProductDetail>(
    `${config.public.apiBase}/products/${route.params.id}`
  );
  product.value = data;
  productForm.value = { name: data.name, description: data.description, price: data.price, categoryId: data.categoryId };
  stockQuantity.value = data.stockQuantity;
}

async function fetchCategories(): Promise<void> {
  const data = await $fetch<CategoryRow[]>(`${config.public.apiBase}/categories`);
  categories.value = data;
}

async function handleUpdateProduct(): Promise<void> {
  productError.value = null;
  productSuccess.value = null;
  isSubmittingProduct.value = true;
  try {
    await $fetch(`${config.public.apiBase}/admin/products/${route.params.id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
      body: productForm.value,
    });
    productSuccess.value = "商品情報を更新しました";
  } catch (err: unknown) {
    productError.value = resolveProductError(err);
  } finally {
    isSubmittingProduct.value = false;
  }
}

async function handleUpdateStock(): Promise<void> {
  stockError.value = null;
  isSubmittingStock.value = true;
  try {
    await $fetch(`${config.public.apiBase}/admin/products/${route.params.id}/stock`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
      body: { quantity: stockQuantity.value },
    });
    await fetchProduct();
  } catch {
    stockError.value = "在庫の更新に失敗しました";
  } finally {
    isSubmittingStock.value = false;
  }
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
  imageError.value = null;
}

async function handleUploadImage(): Promise<void> {
  if (!selectedFile.value) return;
  imageError.value = null;
  isUploadingImage.value = true;
  try {
    const formData = new FormData();
    formData.append("file", selectedFile.value);
    const { imageUrl } = await $fetch<{ imageUrl: string }>(
      `${config.public.apiBase}/admin/images`,
      { method: "POST", headers: { Authorization: `Bearer ${authStore.accessToken}` }, body: formData }
    );
    await $fetch(`${config.public.apiBase}/admin/products/${route.params.id}/images`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
      body: { imageUrl },
    });
    selectedFile.value = null;
    await fetchProduct();
  } catch (err: unknown) {
    imageError.value = resolveImageError(err);
  } finally {
    isUploadingImage.value = false;
  }
}

function resolveProductError(err: unknown): string {
  const code = extractErrorCode(err);
  if (code === "VALIDATION_ERROR") return "入力値が不正です。各項目を確認してください";
  return "商品情報の更新に失敗しました";
}

function resolveImageError(err: unknown): string {
  const code = extractErrorCode(err);
  if (code === "UNSUPPORTED_IMAGE_FORMAT") return "サポート外の画像形式です";
  if (code === "FILE_TOO_LARGE") return "10MB以下のファイルを選択してください";
  return "画像のアップロードに失敗しました";
}

function extractErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { code?: string } }).data;
    return data?.code ?? null;
  }
  return null;
}

onMounted(async () => {
  try {
    await Promise.all([fetchProduct(), fetchCategories()]);
  } catch {
    loadError.value = "商品情報の取得に失敗しました";
  } finally {
    isLoading.value = false;
  }
});
</script>
