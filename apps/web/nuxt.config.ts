export default defineNuxtConfig({
  modules: ["@pinia/nuxt"],
  nitro: {
    preset: "cloudflare-pages",
  },
  typescript: {
    strict: true,
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? "http://localhost:8787",
    },
  },
});
