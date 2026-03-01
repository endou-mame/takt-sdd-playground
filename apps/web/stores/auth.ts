import { defineStore } from "pinia";
import { ref } from "vue";

export type AuthUser = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: "CUSTOMER" | "ADMIN";
};

type JwtPayload = {
  sub: string;
  role: "CUSTOMER" | "ADMIN";
};

function decodeJwtPayload(token: string): JwtPayload {
  const payloadBase64 = token.split(".")[1];
  if (!payloadBase64) {
    throw new Error("Invalid JWT: missing payload segment");
  }
  const decoded = JSON.parse(atob(payloadBase64)) as Record<string, unknown>;
  if (typeof decoded["sub"] !== "string") {
    throw new Error("Invalid JWT: missing sub");
  }
  const role = decoded["role"];
  if (role !== "CUSTOMER" && role !== "ADMIN") {
    throw new Error("Invalid JWT: invalid role");
  }
  return { sub: decoded["sub"], role };
}

const ACCESS_TOKEN_KEY = "auth_access_token";
const REFRESH_TOKEN_KEY = "auth_refresh_token";
const EMAIL_KEY = "auth_email";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<AuthUser | null>(null);
  const accessToken = ref<string | null>(null);
  const refreshToken = ref<string | null>(null);

  function restoreFromStorage(): void {
    if (!import.meta.client) return;
    const storedAccess = localStorage.getItem(ACCESS_TOKEN_KEY);
    const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);
    const storedEmail = localStorage.getItem(EMAIL_KEY);
    if (!storedAccess || !storedRefresh || !storedEmail) return;

    accessToken.value = storedAccess;
    refreshToken.value = storedRefresh;
    try {
      user.value = buildUser(storedEmail, storedAccess);
    } catch {
      clearTokens();
    }
  }

  function persistTokens(access: string, refreshTok: string, email: string): void {
    accessToken.value = access;
    refreshToken.value = refreshTok;
    if (import.meta.client) {
      localStorage.setItem(ACCESS_TOKEN_KEY, access);
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshTok);
      localStorage.setItem(EMAIL_KEY, email);
    }
  }

  function clearTokens(): void {
    accessToken.value = null;
    refreshToken.value = null;
    user.value = null;
    if (import.meta.client) {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(EMAIL_KEY);
    }
  }

  function buildUser(email: string, token: string): AuthUser {
    const payload = decodeJwtPayload(token);
    return {
      id: payload.sub,
      email,
      name: "",
      role: payload.role,
    };
  }

  async function register(email: string, password: string, name: string): Promise<void> {
    const config = useRuntimeConfig();
    await $fetch(`${config.public.apiBase}/auth/register`, {
      method: "POST",
      body: { email, password, name },
    });
  }

  async function login(email: string, password: string): Promise<void> {
    const config = useRuntimeConfig();
    const data = await $fetch<{ accessToken: string; refreshToken: string }>(
      `${config.public.apiBase}/auth/login`,
      {
        method: "POST",
        body: { email, password },
      }
    );
    persistTokens(data.accessToken, data.refreshToken, email);
    user.value = buildUser(email, data.accessToken);
  }

  async function logout(): Promise<void> {
    // Best-effort server-side invalidation. Always clear local state.
    if (refreshToken.value) {
      const config = useRuntimeConfig();
      try {
        await $fetch(`${config.public.apiBase}/auth/logout`, {
          method: "POST",
          headers: accessToken.value
            ? { Authorization: `Bearer ${accessToken.value}` }
            : {},
          body: { refreshToken: refreshToken.value },
        });
      } catch (err) {
        // Server-side invalidation failed. Proceed with local cleanup anyway.
        console.warn("[auth] Server-side logout failed:", err);
      }
    }
    clearTokens();
  }

  async function refresh(): Promise<void> {
    if (!refreshToken.value) {
      throw new Error("No refresh token available");
    }
    const config = useRuntimeConfig();
    const data = await $fetch<{ accessToken: string }>(
      `${config.public.apiBase}/auth/refresh`,
      {
        method: "POST",
        body: { refreshToken: refreshToken.value },
      }
    );
    if (!user.value?.email) {
      throw new Error("Cannot refresh: no authenticated user");
    }
    const currentEmail = user.value.email;
    persistTokens(data.accessToken, refreshToken.value!, currentEmail);
    user.value = buildUser(currentEmail, data.accessToken);
  }

  async function requestPasswordReset(email: string): Promise<void> {
    const config = useRuntimeConfig();
    await $fetch(`${config.public.apiBase}/auth/password-reset`, {
      method: "POST",
      body: { email },
    });
  }

  async function confirmPasswordReset(
    token: string,
    newPassword: string
  ): Promise<void> {
    const config = useRuntimeConfig();
    await $fetch(`${config.public.apiBase}/auth/password-reset/confirm`, {
      method: "POST",
      body: { token, newPassword },
    });
  }

  return {
    user,
    accessToken,
    refreshToken,
    restoreFromStorage,
    register,
    login,
    logout,
    refresh,
    requestPasswordReset,
    confirmPasswordReset,
  };
});
