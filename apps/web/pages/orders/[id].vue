<template>
  <div>
    <h1>注文詳細</h1>
    <p v-if="isLoading">読み込み中...</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <template v-else-if="order">
      <section>
        <h2>注文情報</h2>
        <dl>
          <dt>注文番号</dt><dd>{{ order.orderId }}</dd>
          <dt>注文日</dt><dd>{{ formatDate(order.orderedAt) }}</dd>
          <dt>ステータス</dt><dd>{{ translateStatus(order.status) }}</dd>
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
        <p>{{ order.shippingAddress.name }}</p>
        <p>〒{{ order.shippingAddress.postalCode }} {{ order.shippingAddress.prefecture }}{{ order.shippingAddress.city }}{{ order.shippingAddress.street }}</p>
        <p>電話番号: {{ order.shippingAddress.phone }}</p>
      </section>
    </template>
    <NuxtLink to="/orders">注文一覧に戻る</NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

definePageMeta({ middleware: "auth" });

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
  orderedAt: string;
  status: string;
  subtotal: number;
  shippingFee: number;
  total: number;
  items: OrderItem[];
  shippingAddress: ShippingAddress;
};

const authStore = useAuthStore();
const config = useRuntimeConfig();
const route = useRoute();
const router = useRouter();

const order = ref<OrderDetail | null>(null);
const isLoading = ref(true);
const errorMessage = ref<string | null>(null);

async function fetchOrder(): Promise<void> {
  try {
    const data = await $fetch<OrderDetail>(
      `${config.public.apiBase}/orders/${route.params.id}`,
      {
        headers: { Authorization: `Bearer ${authStore.accessToken}` },
      }
    );
    order.value = data;
  } catch (err: unknown) {
    const status = extractStatus(err);
    if (status === 404) {
      await router.push("/orders");
      return;
    }
    errorMessage.value = "注文詳細の取得に失敗しました";
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

function extractStatus(err: unknown): number | null {
  if (err && typeof err === "object" && "status" in err) {
    return (err as { status?: number }).status ?? null;
  }
  return null;
}

onMounted(() => {
  fetchOrder();
});
</script>
