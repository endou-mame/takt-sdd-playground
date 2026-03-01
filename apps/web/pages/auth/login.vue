<template>
  <div>
    <h1>ログイン</h1>
    <form @submit.prevent="handleSubmit">
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
        <label for="password">パスワード</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
        />
      </div>
      <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
      <button type="submit" :disabled="isLoading">
        {{ isLoading ? "ログイン中..." : "ログイン" }}
      </button>
    </form>
    <nav>
      <NuxtLink to="/auth/register">会員登録はこちら</NuxtLink>
      <NuxtLink to="/auth/reset-password">パスワードをお忘れの方</NuxtLink>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

const authStore = useAuthStore();
const router = useRouter();

const email = ref("");
const password = ref("");
const errorMessage = ref<string | null>(null);
const isLoading = ref(false);

async function handleSubmit(): Promise<void> {
  errorMessage.value = null;
  isLoading.value = true;
  try {
    await authStore.login(email.value, password.value);
    await router.push("/");
  } catch (err: unknown) {
    errorMessage.value = resolveErrorMessage(err);
  } finally {
    isLoading.value = false;
  }
}

function resolveErrorMessage(err: unknown): string {
  const code = extractErrorCode(err);
  if (code === "INVALID_CREDENTIALS") return "メールアドレスまたはパスワードが正しくありません";
  if (code === "ACCOUNT_LOCKED") return "アカウントがロックされています。しばらく待ってから再試行してください";
  return "ログインに失敗しました。再度お試しください";
}

function extractErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { code?: string } }).data;
    return data?.code ?? null;
  }
  return null;
}
</script>
