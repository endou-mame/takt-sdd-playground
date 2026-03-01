<template>
  <div>
    <h1>注文履歴</h1>
    <p v-if="isLoading">読み込み中...</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <ul v-else-if="orders.length > 0">
      <li v-for="order in orders" :key="order.orderId">
        <NuxtLink :to="`/orders/${order.orderId}`">
          <span>注文番号: {{ order.orderId }}</span>
          <span>注文日: {{ formatDate(order.orderedAt) }}</span>
          <span>合計: ¥{{ order.total.toLocaleString() }}</span>
          <span>ステータス: {{ translateStatus(order.status) }}</span>
        </NuxtLink>
      </li>
    </ul>
    <p v-else>注文履歴がありません</p>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

definePageMeta({ middleware: "auth" });

type OrderRow = {
  orderId: string;
  orderedAt: string;
  total: number;
  status: string;
};

const authStore = useAuthStore();
const config = useRuntimeConfig();

const orders = ref<OrderRow[]>([]);
const isLoading = ref(true);
const errorMessage = ref<string | null>(null);

async function fetchOrders(): Promise<void> {
  try {
    const data = await $fetch<OrderRow[]>(`${config.public.apiBase}/orders`, {
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    });
    orders.value = data;
  } catch {
    errorMessage.value = "注文履歴の取得に失敗しました";
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
