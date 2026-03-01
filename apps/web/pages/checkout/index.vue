<template>
  <div>
    <h1>チェックアウト</h1>
    <p v-if="isLoading">読み込み中...</p>
    <p v-else-if="errorMessage" role="alert">{{ errorMessage }}</p>
    <form v-else @submit.prevent="handleSubmit">
      <section>
        <h2>配送先住所</h2>
        <div v-if="addresses.length > 0">
          <label v-for="addr in addresses" :key="addr.addressId">
            <input
              type="radio"
              name="address"
              :value="addr.addressId"
              v-model="selectedAddressId"
            />
            〒{{ addr.postalCode }} {{ addr.prefecture }}{{ addr.city }}{{ addr.street }}（{{ addr.name }}）
          </label>
          <label>
            <input type="radio" name="address" value="new" v-model="selectedAddressId" />
            新しい住所を入力
          </label>
        </div>
        <template v-if="addresses.length === 0 || selectedAddressId === 'new'">
          <div><label>氏名<input v-model="newAddress.name" required /></label></div>
          <div><label>電話番号<input v-model="newAddress.phone" required /></label></div>
          <div><label>郵便番号<input v-model="newAddress.postalCode" required /></label></div>
          <div><label>都道府県<input v-model="newAddress.prefecture" required /></label></div>
          <div><label>市区町村<input v-model="newAddress.city" required /></label></div>
          <div><label>番地・建物<input v-model="newAddress.street" required /></label></div>
        </template>
      </section>

      <section>
        <h2>支払方法</h2>
        <label><input type="radio" value="CREDIT_CARD" v-model="paymentMethod" /> クレジットカード</label>
        <label><input type="radio" value="CONVENIENCE_STORE" v-model="paymentMethod" /> コンビニ払い</label>
        <label><input type="radio" value="CASH_ON_DELIVERY" v-model="paymentMethod" /> 代引き</label>

        <template v-if="paymentMethod === 'CREDIT_CARD'">
          <div><label>カード番号<input v-model="creditCard.cardNumber" required /></label></div>
          <div><label>有効期限（MM/YY）<input v-model="creditCard.expiryMonth" placeholder="MM" required /><input v-model="creditCard.expiryYear" placeholder="YY" required /></label></div>
          <div><label>CVV<input v-model="creditCard.cvv" required /></label></div>
          <div><label>名義人<input v-model="creditCard.holderName" required /></label></div>
        </template>
      </section>

      <section>
        <h2>注文内容確認</h2>
        <ul>
          <li v-for="item in cartStore.items" :key="item.productId">
            {{ item.productName }} × {{ item.quantity }} — ¥{{ (item.unitPrice * item.quantity).toLocaleString() }}
          </li>
        </ul>
        <p>合計: ¥{{ cartStore.subtotal.toLocaleString() }}</p>
      </section>

      <p v-if="submitError" role="alert">{{ submitError }}</p>
      <button type="submit" :disabled="isSubmitting">注文を確定する</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";
import { useCartStore } from "~/stores/cart";

definePageMeta({ middleware: "auth" });

type AddressRow = {
  addressId: string;
  postalCode: string;
  prefecture: string;
  city: string;
  street: string;
  name: string;
  phone: string;
};

type NewAddress = {
  postalCode: string;
  prefecture: string;
  city: string;
  street: string;
  name: string;
  phone: string;
};

type CreditCard = {
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  holderName: string;
};

const authStore = useAuthStore();
const cartStore = useCartStore();
const config = useRuntimeConfig();

const isLoading = ref(true);
const errorMessage = ref<string | null>(null);
const isSubmitting = ref(false);
const submitError = ref<string | null>(null);

const addresses = ref<AddressRow[]>([]);
const selectedAddressId = ref<string>("new");
const paymentMethod = ref<"CREDIT_CARD" | "CONVENIENCE_STORE" | "CASH_ON_DELIVERY">("CREDIT_CARD");
const newAddress = ref<NewAddress>({
  postalCode: "",
  prefecture: "",
  city: "",
  street: "",
  name: "",
  phone: "",
});
const creditCard = ref<CreditCard>({
  cardNumber: "",
  expiryMonth: "",
  expiryYear: "",
  cvv: "",
  holderName: "",
});

async function init(): Promise<void> {
  if (cartStore.items.length === 0) {
    await cartStore.fetchItems();
    if (cartStore.items.length === 0) {
      await navigateTo("/cart");
      return;
    }
  }
  try {
    const data = await $fetch<AddressRow[]>(`${config.public.apiBase}/addresses`, {
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    });
    addresses.value = data;
    if (data.length > 0) {
      selectedAddressId.value = data[0].addressId;
    }
  } catch {
    errorMessage.value = "住所の取得に失敗しました";
  } finally {
    isLoading.value = false;
  }
}

function buildShippingAddress(): NewAddress {
  if (selectedAddressId.value === "new") {
    return newAddress.value;
  }
  const addr = addresses.value.find((a) => a.addressId === selectedAddressId.value);
  if (!addr) {
    throw new Error("Selected address not found");
  }
  return {
    postalCode: addr.postalCode,
    prefecture: addr.prefecture,
    city: addr.city,
    street: addr.street,
    name: addr.name,
    phone: addr.phone,
  };
}

async function handleSubmit(): Promise<void> {
  submitError.value = null;
  isSubmitting.value = true;
  try {
    const shippingAddress = buildShippingAddress();
    const body: Record<string, unknown> = {
      cartItems: cartStore.items,
      shippingAddress,
      paymentMethod: paymentMethod.value,
    };
    if (paymentMethod.value === "CREDIT_CARD") {
      body.creditCard = creditCard.value;
    }
    const data = await $fetch<{ orderId: string }>(`${config.public.apiBase}/checkout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
      body,
    });
    cartStore.clearCart();
    await navigateTo(`/orders/${data.orderId}`);
  } catch (err: unknown) {
    submitError.value = resolveSubmitError(err);
  } finally {
    isSubmitting.value = false;
  }
}

function resolveSubmitError(err: unknown): string {
  const code = extractErrorCode(err);
  if (code === "PAYMENT_DECLINED") return "決済が拒否されました。カード情報をご確認ください";
  if (code === "OUT_OF_STOCK_AT_CHECKOUT") return "在庫切れの商品が含まれています";
  if (code === "PAYMENT_TIMEOUT") return "決済がタイムアウトしました。再度お試しください";
  return "注文の処理に失敗しました。再度お試しください";
}

function extractErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { code?: string } }).data;
    return data?.code ?? null;
  }
  return null;
}

onMounted(() => {
  init();
});
</script>
