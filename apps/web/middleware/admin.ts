import { useAuthStore } from "~/stores/auth";

export default defineNuxtRouteMiddleware(() => {
  const authStore = useAuthStore();
  if (!authStore.accessToken || authStore.user?.role !== "ADMIN") {
    return navigateTo("/auth/login");
  }
});
