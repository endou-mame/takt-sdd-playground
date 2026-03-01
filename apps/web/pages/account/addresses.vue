<template>
  <div>
    <h1>住所帳</h1>

    <section>
      <h2>登録済み住所</h2>
      <p v-if="isLoadingList">読み込み中...</p>
      <p v-else-if="loadError" role="alert">{{ loadError }}</p>
      <ul v-else-if="addresses.length > 0">
        <li v-for="addr in addresses" :key="addr.addressId">
          <template v-if="editingId !== addr.addressId">
            <p>{{ addr.name }}（{{ addr.phone }}）</p>
            <p>〒{{ addr.postalCode }} {{ addr.prefecture }}{{ addr.city }}{{ addr.street }}</p>
            <button @click="startEdit(addr)">編集</button>
            <button @click="handleDelete(addr.addressId)">削除</button>
          </template>
          <template v-else>
            <form @submit.prevent="handleUpdate(addr.addressId)">
              <div><label>氏名<input v-model="editForm.name" required /></label></div>
              <div><label>電話番号<input v-model="editForm.phone" required /></label></div>
              <div><label>郵便番号<input v-model="editForm.postalCode" required /></label></div>
              <div><label>都道府県<input v-model="editForm.prefecture" required /></label></div>
              <div><label>市区町村<input v-model="editForm.city" required /></label></div>
              <div><label>番地・建物<input v-model="editForm.street" required /></label></div>
              <p v-if="submitError" role="alert">{{ submitError }}</p>
              <button type="submit" :disabled="isSubmitting">更新する</button>
              <button type="button" @click="cancelEdit">キャンセル</button>
            </form>
          </template>
        </li>
      </ul>
      <p v-else>住所が登録されていません</p>
    </section>

    <section>
      <h2>新しい住所を追加</h2>
      <form @submit.prevent="handleCreate">
        <div><label>氏名<input v-model="createForm.name" required /></label></div>
        <div><label>電話番号<input v-model="createForm.phone" required /></label></div>
        <div><label>郵便番号<input v-model="createForm.postalCode" required /></label></div>
        <div><label>都道府県<input v-model="createForm.prefecture" required /></label></div>
        <div><label>市区町村<input v-model="createForm.city" required /></label></div>
        <div><label>番地・建物<input v-model="createForm.street" required /></label></div>
        <p v-if="createError" role="alert">{{ createError }}</p>
        <button type="submit" :disabled="isSubmitting">追加する</button>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

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

type AddressFields = {
  postalCode: string;
  prefecture: string;
  city: string;
  street: string;
  name: string;
  phone: string;
};

function emptyFields(): AddressFields {
  return { postalCode: "", prefecture: "", city: "", street: "", name: "", phone: "" };
}

const authStore = useAuthStore();
const config = useRuntimeConfig();

const addresses = ref<AddressRow[]>([]);
const isLoadingList = ref(true);
const loadError = ref<string | null>(null);
const isSubmitting = ref(false);
const submitError = ref<string | null>(null);
const createError = ref<string | null>(null);
const editingId = ref<string | null>(null);
const editForm = ref<AddressFields>(emptyFields());
const createForm = ref<AddressFields>(emptyFields());

async function fetchAddresses(): Promise<void> {
  isLoadingList.value = true;
  loadError.value = null;
  try {
    const data = await $fetch<AddressRow[]>(`${config.public.apiBase}/addresses`, {
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    });
    addresses.value = data;
  } catch {
    loadError.value = "住所の取得に失敗しました";
  } finally {
    isLoadingList.value = false;
  }
}

async function handleCreate(): Promise<void> {
  createError.value = null;
  isSubmitting.value = true;
  try {
    await $fetch(`${config.public.apiBase}/addresses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
      body: createForm.value,
    });
    createForm.value = emptyFields();
    await fetchAddresses();
  } catch (err: unknown) {
    createError.value = resolveSubmitError(err);
  } finally {
    isSubmitting.value = false;
  }
}

async function handleUpdate(addressId: string): Promise<void> {
  submitError.value = null;
  isSubmitting.value = true;
  try {
    await $fetch(`${config.public.apiBase}/addresses/${addressId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
      body: editForm.value,
    });
    editingId.value = null;
    await fetchAddresses();
  } catch (err: unknown) {
    submitError.value = resolveSubmitError(err);
  } finally {
    isSubmitting.value = false;
  }
}

async function handleDelete(addressId: string): Promise<void> {
  if (!confirm("この住所を削除してよろしいですか？")) return;
  try {
    await $fetch(`${config.public.apiBase}/addresses/${addressId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    });
    await fetchAddresses();
  } catch {
    loadError.value = "住所の削除に失敗しました";
  }
}

function startEdit(addr: AddressRow): void {
  editingId.value = addr.addressId;
  editForm.value = {
    postalCode: addr.postalCode,
    prefecture: addr.prefecture,
    city: addr.city,
    street: addr.street,
    name: addr.name,
    phone: addr.phone,
  };
  submitError.value = null;
}

function cancelEdit(): void {
  editingId.value = null;
  submitError.value = null;
}

function resolveSubmitError(err: unknown): string {
  const code = extractErrorCode(err);
  if (code === "ADDRESS_BOOK_LIMIT_EXCEEDED") return "住所は最大10件まで登録できます";
  if (code === "FORBIDDEN") return "この操作は許可されていません";
  return "操作に失敗しました。再度お試しください";
}

function extractErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { code?: string } }).data;
    return data?.code ?? null;
  }
  return null;
}

onMounted(() => {
  fetchAddresses();
});
</script>
