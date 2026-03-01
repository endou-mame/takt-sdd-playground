<template>
  <div>
    <h1>会員詳細（管理者）</h1>
    <p v-if="isLoading">読み込み中...</p>
    <p v-else-if="errorMessage" role="alert">
      {{ errorMessage }}
      <NuxtLink to="/admin/customers">会員一覧に戻る</NuxtLink>
    </p>
    <template v-else-if="customer">
      <section>
        <h2>基本情報</h2>
        <dl>
          <dt>ID</dt><dd>{{ customer.userId }}</dd>
          <dt>メールアドレス</dt><dd>{{ customer.email }}</dd>
          <dt>ロール</dt><dd>{{ translateRole(customer.role) }}</dd>
          <dt>メール認証</dt><dd>{{ customer.emailVerified ? "確認済み" : "未確認" }}</dd>
          <dt>登録日</dt><dd>{{ formatDate(customer.createdAt) }}</dd>
        </dl>
      </section>

      <section>
        <h2>注文履歴</h2>
        <ul v-if="customer.orders.length > 0">
          <li v-for="order in customer.orders" :key="order.orderId">
            <NuxtLink :to="`/admin/orders/${order.orderId}`">
              {{ formatDate(order.orderedAt) }} — {{ translateStatus(order.status) }} — ¥{{ order.total.toLocaleString() }}
            </NuxtLink>
          </li>
        </ul>
        <p v-else>注文履歴がありません</p>
      </section>

      <section>
        <h2>登録住所</h2>
        <ul v-if="customer.addresses.length > 0">
          <li v-for="addr in customer.addresses" :key="addr.addressId">
            〒{{ addr.postalCode }} {{ addr.prefecture }}{{ addr.city }}{{ addr.street }}（{{ addr.name }}）
          </li>
        </ul>
        <p v-else>住所が登録されていません</p>
      </section>
    </template>
    <NuxtLink to="/admin/customers">会員一覧に戻る</NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

definePageMeta({ middleware: "admin" });

type OrderRow = {
  orderId: string;
  orderedAt: string;
  total: number;
  status: string;
};

type AddressRow = {
  addressId: string;
  postalCode: string;
  prefecture: string;
  city: string;
  street: string;
  name: string;
  phone: string;
};

type CustomerDetail = {
  userId: string;
  email: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
  orders: OrderRow[];
  addresses: AddressRow[];
};

const authStore = useAuthStore();
const config = useRuntimeConfig();
const route = useRoute();

const customer = ref<CustomerDetail | null>(null);
const isLoading = ref(true);
const errorMessage = ref<string | null>(null);

async function fetchCustomer(): Promise<void> {
  try {
    const data = await $fetch<CustomerDetail>(
      `${config.public.apiBase}/admin/customers/${route.params.id}`,
      { headers: { Authorization: `Bearer ${authStore.accessToken}` } }
    );
    customer.value = data;
  } catch (err: unknown) {
    const status = extractStatus(err);
    if (status === 404) {
      errorMessage.value = "会員が見つかりませんでした";
    } else {
      errorMessage.value = "会員情報の取得に失敗しました";
    }
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
  fetchCustomer();
});
</script>
