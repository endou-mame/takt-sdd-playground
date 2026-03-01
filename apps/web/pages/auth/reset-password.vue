<template>
  <div>
    <h1>パスワードリセット</h1>

    <!-- トークンなし：メール入力フォーム -->
    <form v-if="!resetToken" @submit.prevent="handleRequestReset">
      <p>登録済みのメールアドレスを入力してください。パスワードリセットのリンクをお送りします。</p>
      <div>
        <label for="email">メールアドレス</label>
        <input
          id="email"
          v-model="email"
          type="email"
          required
          autocomplete="email"
        />
      </div>
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <p v-if="successMessage">{{ successMessage }}</p>
      <button type="submit" :disabled="isLoading || !!successMessage">
        {{ isLoading ? "送信中..." : "リセットメールを送信" }}
      </button>
    </form>

    <!-- トークンあり：新パスワード入力フォーム -->
    <form v-else @submit.prevent="handleConfirmReset">
      <p>新しいパスワードを入力してください。</p>
      <div>
        <label for="newPassword">新しいパスワード（8文字以上）</label>
        <input
          id="newPassword"
          v-model="newPassword"
          type="password"
          required
          minlength="8"
          autocomplete="new-password"
        />
      </div>
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <p v-if="successMessage">{{ successMessage }}</p>
      <button type="submit" :disabled="isLoading || !!successMessage">
        {{ isLoading ? "変更中..." : "パスワードを変更する" }}
      </button>
    </form>

    <nav>
      <NuxtLink to="/auth/login">ログインに戻る</NuxtLink>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

const authStore = useAuthStore();
const route = useRoute();

const resetToken = computed(() => {
  const t = route.query.token;
  return typeof t === "string" && t.length > 0 ? t : null;
});

const email = ref("");
const newPassword = ref("");
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const isLoading = ref(false);

async function handleRequestReset(): Promise<void> {
  errorMessage.value = null;
  successMessage.value = null;
  isLoading.value = true;
  try {
    await authStore.requestPasswordReset(email.value);
    successMessage.value =
      "パスワードリセットのメールをお送りしました。メールをご確認ください。";
  } catch {
    errorMessage.value = "メールの送信に失敗しました。再度お試しください";
  } finally {
    isLoading.value = false;
  }
}

async function handleConfirmReset(): Promise<void> {
  errorMessage.value = null;
  successMessage.value = null;

  if (!resetToken.value) {
    errorMessage.value = "無効なリセットリンクです";
    return;
  }

  if (newPassword.value.length < 8) {
    errorMessage.value = "パスワードは8文字以上で入力してください";
    return;
  }

  isLoading.value = true;
  try {
    await authStore.confirmPasswordReset(resetToken.value, newPassword.value);
    successMessage.value =
      "パスワードを変更しました。新しいパスワードでログインしてください。";
  } catch (err: unknown) {
    errorMessage.value = resolveConfirmErrorMessage(err);
  } finally {
    isLoading.value = false;
  }
}

function resolveConfirmErrorMessage(err: unknown): string {
  const code = extractErrorCode(err);
  if (code === "VERIFICATION_TOKEN_EXPIRED")
    return "リセットリンクの有効期限が切れています。再度リセットをお申し込みください";
  if (code === "VERIFICATION_TOKEN_USED")
    return "このリセットリンクはすでに使用済みです。再度リセットをお申し込みください";
  return "パスワードの変更に失敗しました。再度お試しください";
}

function extractErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { code?: string } }).data;
    return data?.code ?? null;
  }
  return null;
}
</script>
