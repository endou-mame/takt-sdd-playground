<template>
  <div>
    <h1>注文管理</h1>

    <form @submit.prevent="fetchOrders">
      <label>
        ステータス
        <select v-model="filterStatus">
          <option value="">すべて</option>
          <option value="PENDING">受付中</option>
          <option value="PAID">決済完了</option>
          <option value="SHIPPED">発送済み</option>
          <option value="COMPLETED">完了</option>
          <option value="CANCELLED">キャンセル</option>
          <option value="REFUNDED">返金済み</option>
        </select>
      </label>
      <label>
        開始日<input type="date" v-model="filterFromDate" />
      </label>
      <label>
        終了日<input type="date" v-model="filterToDate" />
      </label>
      <button type="submit">絞り込む</button>
    </form>

    <p v-if="isLoading">読み込み中...</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <table v-else-if="orders.length > 0">
      <thead>
        <tr>
          <th>注文番号</th>
          <th>顧客ID</th>
          <th>ステータス</th>
          <th>合計</th>
          <th>注文日</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="order in orders" :key="order.orderId">
          <td>{{ order.orderId }}</td>
          <td>{{ order.customerId }}</td>
          <td>{{ translateStatus(order.status) }}</td>
          <td>¥{{ order.total.toLocaleString() }}</td>
          <td>{{ formatDate(order.orderedAt) }}</td>
          <td><NuxtLink :to="`/admin/orders/${order.orderId}`">詳細</NuxtLink></td>
        </tr>
      </tbody>
    </table>
    <p v-else>該当する注文がありません</p>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

definePageMeta({ middleware: "admin" });

type OrderRow = {
  orderId: string;
  customerId: string;
  status: string;
  total: number;
  orderedAt: string;
};

const authStore = useAuthStore();
const config = useRuntimeConfig();

const orders = ref<OrderRow[]>([]);
const isLoading = ref(true);
const errorMessage = ref<string | null>(null);
const filterStatus = ref("");
const filterFromDate = ref("");
const filterToDate = ref("");

async function fetchOrders(): Promise<void> {
  isLoading.value = true;
  errorMessage.value = null;
  try {
    const params = new URLSearchParams();
    if (filterStatus.value) params.set("status", filterStatus.value);
    if (filterFromDate.value) params.set("fromDate", filterFromDate.value);
    if (filterToDate.value) params.set("toDate", filterToDate.value);
    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await $fetch<OrderRow[]>(`${config.public.apiBase}/admin/orders${query}`, {
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    });
    orders.value = data;
  } catch {
    errorMessage.value = "注文一覧の取得に失敗しました";
  } finally {
    isLoading.value = false;
  }
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ja-JP");
}

function translateStatus(status: string): string {
  const statusMap: Record<string, string> = {
    PENDING: "受付中",
    PAID: "決済完了",
    SHIPPED: "発送済み",
    COMPLETED: "完了",
    CANCELLED: "キャンセル",
    REFUNDED: "返金済み",
  };
  return statusMap[status] ?? status;
}

onMounted(() => {
  fetchOrders();
});
</script>
