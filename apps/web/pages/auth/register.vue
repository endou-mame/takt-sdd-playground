<template>
  <div>
    <h1>会員登録</h1>
    <form @submit.prevent="handleSubmit">
      <div>
        <label for="name">お名前</label>
        <input
          id="name"
          v-model="name"
          type="text"
          required
          autocomplete="name"
        />
      </div>
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
      <div>
        <label for="password">パスワード（8文字以上）</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          minlength="8"
          autocomplete="new-password"
        />
      </div>
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <p v-if="successMessage">{{ successMessage }}</p>
      <button type="submit" :disabled="isLoading || !!successMessage">
        {{ isLoading ? "登録中..." : "登録する" }}
      </button>
    </form>
    <nav>
      <NuxtLink to="/auth/login">すでにアカウントをお持ちの方</NuxtLink>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

const authStore = useAuthStore();

const name = ref("");
const email = ref("");
const password = ref("");
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);
const isLoading = ref(false);

async function handleSubmit(): Promise<void> {
  errorMessage.value = null;
  successMessage.value = null;

  if (password.value.length < 8) {
    errorMessage.value = "パスワードは8文字以上で入力してください";
    return;
  }

  isLoading.value = true;
  try {
    await authStore.register(email.value, password.value, name.value);
    successMessage.value =
      "登録が完了しました。確認メールをお送りしましたのでご確認ください。";
  } catch (err: unknown) {
    errorMessage.value = resolveErrorMessage(err);
  } finally {
    isLoading.value = false;
  }
}

function resolveErrorMessage(err: unknown): string {
  const code = extractErrorCode(err);
  if (code === "DUPLICATE_EMAIL") return "このメールアドレスはすでに登録されています";
  if (code === "INVALID_EMAIL") return "メールアドレスの形式が正しくありません";
  if (code === "PASSWORD_TOO_SHORT") return "パスワードは8文字以上で入力してください";
  return "登録に失敗しました。再度お試しください";
}

function extractErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { code?: string } }).data;
    return data?.code ?? null;
  }
  return null;
}
</script>
