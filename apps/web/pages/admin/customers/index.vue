<template>
  <div>
    <h1>会員管理</h1>

    <form @submit.prevent="fetchCustomers">
      <label>
        キーワード（氏名・メールアドレス）
        <input v-model="keyword" type="text" placeholder="検索キーワード" />
      </label>
      <button type="submit">検索</button>
    </form>

    <p v-if="isLoading">読み込み中...</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <table v-else-if="customers.length > 0">
      <thead>
        <tr>
          <th>ID</th>
          <th>メールアドレス</th>
          <th>ロール</th>
          <th>メール認証</th>
          <th>登録日</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="customer in customers" :key="customer.userId">
          <td>{{ customer.userId }}</td>
          <td>{{ customer.email }}</td>
          <td>{{ translateRole(customer.role) }}</td>
          <td>{{ customer.emailVerified ? "確認済み" : "未確認" }}</td>
          <td>{{ formatDate(customer.createdAt) }}</td>
          <td><NuxtLink :to="`/admin/customers/${customer.userId}`">詳細</NuxtLink></td>
        </tr>
      </tbody>
    </table>
    <p v-else>該当する会員がいません</p>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

definePageMeta({ middleware: "admin" });

type CustomerRow = {
  userId: string;
  email: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
};

const authStore = useAuthStore();
const config = useRuntimeConfig();

const customers = ref<CustomerRow[]>([]);
const isLoading = ref(true);
const errorMessage = ref<string | null>(null);
const keyword = ref("");

async function fetchCustomers(): Promise<void> {
  isLoading.value = true;
  errorMessage.value = null;
  try {
    const params = new URLSearchParams();
    if (keyword.value) params.set("keyword", keyword.value);
    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await $fetch<CustomerRow[]>(
      `${config.public.apiBase}/admin/customers${query}`,
      { headers: { Authorization: `Bearer ${authStore.accessToken}` } }
    );
    customers.value = data;
  } catch {
    errorMessage.value = "会員一覧の取得に失敗しました";
  } finally {
    isLoading.value = false;
  }
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ja-JP");
}

function translateRole(role: string): string {
  return role === "ADMIN" ? "管理者" : "一般会員";
}

onMounted(() => {
  fetchCustomers();
});
</script>
