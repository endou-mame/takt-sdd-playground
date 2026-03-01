<template>
  <div>
    <h1>商品新規作成</h1>

    <p v-if="isLoadingCategories">カテゴリ読み込み中...</p>
    <p v-else-if="loadCategoryError" role="alert">{{ loadCategoryError }}</p>
    <form v-else @submit.prevent="handleSubmit">
      <div>
        <label>商品名（必須）<input v-model="form.name" required /></label>
      </div>
      <div>
        <label>説明（必須）<textarea v-model="form.description" required></textarea></label>
      </div>
      <div>
        <label>価格（円）<input v-model.number="form.price" type="number" min="0" required /></label>
      </div>
      <div>
        <label>
          カテゴリ
          <select v-model="form.categoryId" required>
            <option value="" disabled>選択してください</option>
            <option v-for="cat in categories" :key="cat.categoryId" :value="cat.categoryId">
              {{ cat.name }}
            </option>
          </select>
        </label>
      </div>
      <div>
        <label>在庫数<input v-model.number="form.stock" type="number" min="0" required /></label>
      </div>
      <p v-if="submitError" role="alert">{{ submitError }}</p>
      <button type="submit" :disabled="isSubmitting">登録する</button>
      <NuxtLink to="/admin/products">キャンセル</NuxtLink>
    </form>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

definePageMeta({ middleware: "admin" });

type CategoryRow = {
  categoryId: string;
  name: string;
};

type ProductForm = {
  name: string;
  description: string;
  price: number;
  categoryId: string;
  stock: number;
};

const authStore = useAuthStore();
const config = useRuntimeConfig();

const categories = ref<CategoryRow[]>([]);
const isLoadingCategories = ref(true);
const loadCategoryError = ref<string | null>(null);
const isSubmitting = ref(false);
const submitError = ref<string | null>(null);

const form = ref<ProductForm>({
  name: "",
  description: "",
  price: 0,
  categoryId: "",
  stock: 0,
});

async function fetchCategories(): Promise<void> {
  try {
    const data = await $fetch<CategoryRow[]>(`${config.public.apiBase}/categories`);
    categories.value = data;
  } catch {
    loadCategoryError.value = "カテゴリの取得に失敗しました";
  } finally {
    isLoadingCategories.value = false;
  }
}

async function handleSubmit(): Promise<void> {
  submitError.value = null;
  isSubmitting.value = true;
  try {
    await $fetch(`${config.public.apiBase}/admin/products`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
      body: form.value,
    });
    await navigateTo("/admin/products");
  } catch (err: unknown) {
    submitError.value = resolveSubmitError(err);
  } finally {
    isSubmitting.value = false;
  }
}

function resolveSubmitError(err: unknown): string {
  const code = extractErrorCode(err);
  if (code === "VALIDATION_ERROR") return "入力値が不正です。各項目を確認してください";
  return "商品の登録に失敗しました。再度お試しください";
}

function extractErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { code?: string } }).data;
    return data?.code ?? null;
  }
  return null;
}

onMounted(() => {
  fetchCategories();
});
</script>
