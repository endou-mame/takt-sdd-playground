<template>
  <div>
    <h1>カテゴリ管理</h1>

    <section>
      <h2>カテゴリ一覧</h2>
      <p v-if="isLoading">読み込み中...</p>
      <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <ul v-else-if="categories.length > 0">
        <li v-for="cat in categories" :key="cat.categoryId">
          {{ cat.name }}
          <button @click="handleDelete(cat.categoryId)">削除</button>
        </li>
      </ul>
      <p v-else>カテゴリがありません</p>
    </section>

    <section>
      <h2>新規カテゴリ作成</h2>
      <form @submit.prevent="handleCreate">
        <label>カテゴリ名<input v-model="newCategoryName" required /></label>
        <p v-if="createError" role="alert">{{ createError }}</p>
        <button type="submit" :disabled="isSubmitting">登録する</button>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

definePageMeta({ middleware: "admin" });

type CategoryRow = {
  categoryId: string;
  name: string;
};

const authStore = useAuthStore();
const config = useRuntimeConfig();

const categories = ref<CategoryRow[]>([]);
const isLoading = ref(true);
const errorMessage = ref<string | null>(null);
const newCategoryName = ref("");
const isSubmitting = ref(false);
const createError = ref<string | null>(null);

async function fetchCategories(): Promise<void> {
  isLoading.value = true;
  errorMessage.value = null;
  try {
    const data = await $fetch<CategoryRow[]>(
      `${config.public.apiBase}/admin/categories`,
      { headers: { Authorization: `Bearer ${authStore.accessToken}` } }
    );
    categories.value = data;
  } catch {
    errorMessage.value = "カテゴリ一覧の取得に失敗しました";
  } finally {
    isLoading.value = false;
  }
}

async function handleCreate(): Promise<void> {
  createError.value = null;
  isSubmitting.value = true;
  try {
    await $fetch(`${config.public.apiBase}/admin/categories`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
      body: { name: newCategoryName.value },
    });
    newCategoryName.value = "";
    await fetchCategories();
  } catch (err: unknown) {
    createError.value = resolveCreateError(err);
  } finally {
    isSubmitting.value = false;
  }
}

async function handleDelete(categoryId: string): Promise<void> {
  if (!confirm("このカテゴリを削除してよろしいですか？")) return;
  try {
    await $fetch(`${config.public.apiBase}/admin/categories/${categoryId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    });
    await fetchCategories();
  } catch (err: unknown) {
    errorMessage.value = resolveDeleteError(err);
  }
}

function resolveCreateError(err: unknown): string {
  const code = extractErrorCode(err);
  if (code === "CATEGORY_NAME_CONFLICT") return "同名のカテゴリが既に存在します";
  return "カテゴリの作成に失敗しました";
}

function resolveDeleteError(err: unknown): string {
  const code = extractErrorCode(err);
  if (code === "CATEGORY_HAS_PRODUCTS") return "商品が紐付いているため削除できません";
  return "カテゴリの削除に失敗しました";
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
