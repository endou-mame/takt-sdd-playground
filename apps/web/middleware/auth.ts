import { useAuthStore } from "~/stores/auth";

export default defineNuxtRouteMiddleware(() => {
  const authStore = useAuthStore();
  if (!authStore.accessToken) {
    return navigateTo("/auth/login");
  }
});
