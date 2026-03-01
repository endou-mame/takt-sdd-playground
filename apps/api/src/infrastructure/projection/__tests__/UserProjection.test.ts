import { describe, it, expect, beforeEach } from "vitest";
import { UserProjection } from "../UserProjection";
import { createD1MockHandle, type D1MockHandle } from "../../repository/__tests__/d1MockFactory";
import type { UserEvent } from "../../../domain/user/UserEvents";

describe("UserProjection", () => {
  let handle: D1MockHandle;
  let projection: UserProjection;

  beforeEach(() => {
    handle = createD1MockHandle();
    projection = new UserProjection(handle.d1);
  });

  describe("EmailVerified", () => {
    it("issues an UPDATE query", async () => {
      const event: UserEvent = { type: "EmailVerified", userId: "user-1" };
      await projection.apply(event);
      const updateCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("update"));
      expect(updateCall).toBeDefined();
    });
  });

  describe("non-EmailVerified events", () => {
    const noOpEvents: UserEvent[] = [
      { type: "UserRegistered", userId: "u1", email: "a@b.com", name: "Alice" },
      { type: "PasswordResetRequested", userId: "u1" },
      { type: "PasswordReset", userId: "u1" },
      { type: "LoginFailed", userId: "u1" },
      { type: "AccountLocked", userId: "u1", lockedUntil: "2024-01-01T00:15:00.000Z" },
      { type: "AccountUnlocked", userId: "u1" },
    ];

    for (const event of noOpEvents) {
      it(`issues no DB queries for ${event.type}`, async () => {
        await projection.apply(event);
        expect(handle.calls).toHaveLength(0);
      });
    }
  });
});
