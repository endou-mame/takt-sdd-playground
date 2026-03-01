import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAuthStore } from "../auth";

// Nuxt auto-imports are not available in vitest; stub them globally
const mockFetch = vi.fn();
vi.stubGlobal("$fetch", mockFetch);
vi.stubGlobal("useRuntimeConfig", () => ({
  public: { apiBase: "http://localhost:8787" },
}));

// atob is available in node 16+, but stub in case
if (typeof globalThis.atob === "undefined") {
  vi.stubGlobal("atob", (str: string) =>
    Buffer.from(str, "base64").toString("utf-8")
  );
}

/** Build a minimal JWT-like token with the given payload */
function makeToken(payload: object): string {
  const header = btoa(JSON.stringify({ alg: "HS256" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe("useAuthStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockFetch.mockReset();
  });

  describe("initial state", () => {
    it("user is null", () => {
      const store = useAuthStore();
      expect(store.user).toBeNull();
    });

    it("accessToken is null", () => {
      const store = useAuthStore();
      expect(store.accessToken).toBeNull();
    });

    it("refreshToken is null", () => {
      const store = useAuthStore();
      expect(store.refreshToken).toBeNull();
    });
  });

  describe("login", () => {
    it("sets accessToken and user after successful login", async () => {
      const token = makeToken({ sub: "user-1", role: "CUSTOMER" });
      mockFetch.mockResolvedValueOnce({
        accessToken: token,
        refreshToken: "refresh-token-abc",
      });

      const store = useAuthStore();
      await store.login("test@example.com", "password123");

      expect(store.accessToken).toBe(token);
      expect(store.refreshToken).toBe("refresh-token-abc");
      expect(store.user).toMatchObject({
        id: "user-1",
        email: "test@example.com",
        role: "CUSTOMER",
      });
    });

    it("calls the login endpoint with correct arguments", async () => {
      const token = makeToken({ sub: "user-1", role: "CUSTOMER" });
      mockFetch.mockResolvedValueOnce({
        accessToken: token,
        refreshToken: "r",
      });

      const store = useAuthStore();
      await store.login("a@b.com", "pass1234");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8787/auth/login",
        expect.objectContaining({
          method: "POST",
          body: { email: "a@b.com", password: "pass1234" },
        })
      );
    });

    it("propagates fetch error on failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const store = useAuthStore();
      await expect(store.login("x@y.com", "pass")).rejects.toThrow(
        "Network error"
      );
    });
  });

  describe("logout", () => {
    it("clears tokens and user on logout", async () => {
      const token = makeToken({ sub: "user-1", role: "CUSTOMER" });
      mockFetch.mockResolvedValueOnce({
        accessToken: token,
        refreshToken: "refresh-abc",
      });
      const store = useAuthStore();
      await store.login("test@example.com", "password123");

      mockFetch.mockResolvedValueOnce({ success: true });
      await store.logout();

      expect(store.accessToken).toBeNull();
      expect(store.refreshToken).toBeNull();
      expect(store.user).toBeNull();
    });

    it("clears tokens even if logout API call fails", async () => {
      const token = makeToken({ sub: "u", role: "CUSTOMER" });
      mockFetch.mockResolvedValueOnce({ accessToken: token, refreshToken: "r" });
      const store = useAuthStore();
      await store.login("e@mail.com", "pass1234");

      mockFetch.mockRejectedValueOnce(new Error("API error"));
      await store.logout();

      expect(store.accessToken).toBeNull();
      expect(store.refreshToken).toBeNull();
    });
  });

  describe("register", () => {
    it("calls the register endpoint", async () => {
      mockFetch.mockResolvedValueOnce({ userId: "new-user" });
      const store = useAuthStore();
      await store.register("new@user.com", "password8");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8787/auth/register",
        expect.objectContaining({
          method: "POST",
          body: { email: "new@user.com", password: "password8" },
        })
      );
    });
  });

  describe("requestPasswordReset", () => {
    it("calls the password-reset endpoint", async () => {
      mockFetch.mockResolvedValueOnce({ success: true });
      const store = useAuthStore();
      await store.requestPasswordReset("user@example.com");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8787/auth/password-reset",
        expect.objectContaining({
          method: "POST",
          body: { email: "user@example.com" },
        })
      );
    });
  });

  describe("confirmPasswordReset", () => {
    it("calls the password-reset/confirm endpoint", async () => {
      mockFetch.mockResolvedValueOnce({ success: true });
      const store = useAuthStore();
      await store.confirmPasswordReset("reset-token", "newPass123");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8787/auth/password-reset/confirm",
        expect.objectContaining({
          method: "POST",
          body: { token: "reset-token", newPassword: "newPass123" },
        })
      );
    });
  });
});
