<template>
  <div>
    <h1>注文詳細（管理者）</h1>
    <p v-if="isLoading">読み込み中...</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <template v-else-if="order">
      <section>
        <h2>注文情報</h2>
        <dl>
          <dt>注文番号</dt><dd>{{ order.orderId }}</dd>
          <dt>顧客ID</dt><dd>{{ order.customerId }}</dd>
          <dt>注文日</dt><dd>{{ formatDate(order.orderedAt) }}</dd>
          <dt>ステータス</dt><dd>{{ translateStatus(order.status) }}</dd>
          <dt>支払方法</dt><dd>{{ translatePayment(order.paymentMethod) }}</dd>
          <dt>小計</dt><dd>¥{{ order.subtotal.toLocaleString() }}</dd>
          <dt>送料</dt><dd>¥{{ order.shippingFee.toLocaleString() }}</dd>
          <dt>合計</dt><dd>¥{{ order.total.toLocaleString() }}</dd>
        </dl>
      </section>

      <section>
        <h2>注文明細</h2>
        <ul>
          <li v-for="item in order.items" :key="item.productId">
            {{ item.productName }} × {{ item.quantity }} — ¥{{ (item.unitPrice * item.quantity).toLocaleString() }}
          </li>
        </ul>
      </section>

      <section>
        <h2>配送先</h2>
        <p>{{ order.shippingAddress.name }}（{{ order.shippingAddress.phone }}）</p>
        <p>〒{{ order.shippingAddress.postalCode }} {{ order.shippingAddress.prefecture }}{{ order.shippingAddress.city }}{{ order.shippingAddress.street }}</p>
      </section>

      <section>
        <h2>操作</h2>
        <p v-if="actionError" role="alert">{{ actionError }}</p>
        <button
          v-if="order.status === 'PAID'"
          :disabled="isActing"
          @click="updateStatus('SHIPPED')"
        >発送済みにする</button>
        <button
          v-if="order.status === 'SHIPPED'"
          :disabled="isActing"
          @click="updateStatus('COMPLETED')"
        >完了にする</button>
        <button
          v-if="order.status === 'PAID' || order.status === 'SHIPPED'"
          :disabled="isActing"
          @click="handleCancel"
        >キャンセル</button>
        <button
          v-if="order.status === 'COMPLETED'"
          :disabled="isActing"
          @click="handleRefund"
        >返金</button>
      </section>
    </template>
    <NuxtLink to="/admin/orders">注文一覧に戻る</NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

definePageMeta({ middleware: "admin" });

type OrderItem = {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
};

type ShippingAddress = {
  name: string;
  postalCode: string;
  prefecture: string;
  city: string;
  street: string;
  phone: string;
};

type OrderDetail = {
  orderId: string;
  customerId: string;
  orderedAt: string;
  status: string;
  paymentMethod: string;
  subtotal: number;
  shippingFee: number;
  total: number;
  items: OrderItem[];
  shippingAddress: ShippingAddress;
};

const authStore = useAuthStore();
const config = useRuntimeConfig();
const route = useRoute();

const order = ref<OrderDetail | null>(null);
const isLoading = ref(true);
const errorMessage = ref<string | null>(null);
const isActing = ref(false);
const actionError = ref<string | null>(null);

async function fetchOrder(): Promise<void> {
  try {
    const data = await $fetch<OrderDetail>(
      `${config.public.apiBase}/admin/orders/${route.params.id}`,
      { headers: { Authorization: `Bearer ${authStore.accessToken}` } }
    );
    order.value = data;
  } catch {
    errorMessage.value = "注文詳細の取得に失敗しました";
  } finally {
    isLoading.value = false;
  }
}

async function updateStatus(status: "SHIPPED" | "COMPLETED"): Promise<void> {
  actionError.value = null;
  isActing.value = true;
  try {
    await $fetch(`${config.public.apiBase}/admin/orders/${route.params.id}/status`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
      body: { status },
    });
    await fetchOrder();
  } catch {
    actionError.value = "ステータスの更新に失敗しました";
  } finally {
    isActing.value = false;
  }
}

async function handleCancel(): Promise<void> {
  if (!confirm("この注文をキャンセルしてよろしいですか？")) return;
  actionError.value = null;
  isActing.value = true;
  try {
    await $fetch(`${config.public.apiBase}/admin/orders/${route.params.id}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    });
    await fetchOrder();
  } catch {
    actionError.value = "キャンセルに失敗しました";
  } finally {
    isActing.value = false;
  }
}

async function handleRefund(): Promise<void> {
  if (!confirm("この注文を返金してよろしいですか？")) return;
  actionError.value = null;
  isActing.value = true;
  try {
    await $fetch(`${config.public.apiBase}/admin/orders/${route.params.id}/refund`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    });
    await fetchOrder();
  } catch {
    actionError.value = "返金に失敗しました";
  } finally {
    isActing.value = false;
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

function translatePayment(method: string): string {
  const methodMap: Record<string, string> = {
    CREDIT_CARD: "クレジットカード",
    CONVENIENCE_STORE: "コンビニ払い",
    CASH_ON_DELIVERY: "代引き",
  };
  return methodMap[method] ?? method;
}

onMounted(() => {
  fetchOrder();
});
</script>
