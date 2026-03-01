import { describe, it, expect, beforeEach } from "vitest";
import { EmailRetryRepository, MAX_ATTEMPTS } from "../EmailRetryRepository";
import { createD1MockHandle, type D1MockHandle } from "../../repository/__tests__/d1MockFactory";

// emailSendAttempts column order from schema.ts:
// id, orderId (order_id), emailType (email_type), attemptCount (attempt_count),
// lastError (last_error), createdAt (created_at), updatedAt (updated_at)
function attemptRow(overrides: Partial<{
  id: string; orderId: string; emailType: string;
  attemptCount: number; lastError: string | null;
  createdAt: string; updatedAt: string;
}> = {}): unknown[] {
  return [
    overrides.id ?? "attempt-1",
    overrides.orderId ?? "order-1",
    overrides.emailType ?? "ORDER_CONFIRMATION",
    overrides.attemptCount ?? 0,
    overrides.lastError ?? null,
    overrides.createdAt ?? "2024-01-01T00:00:00.000Z",
    overrides.updatedAt ?? "2024-01-01T00:00:00.000Z",
  ];
}

describe("EmailRetryRepository", () => {
  let handle: D1MockHandle;
  let repo: EmailRetryRepository;

  beforeEach(() => {
    handle = createD1MockHandle();
    repo = new EmailRetryRepository(handle.d1);
  });

  describe("MAX_ATTEMPTS", () => {
    it("is 3", () => {
      expect(MAX_ATTEMPTS).toBe(3);
    });
  });

  describe("findByOrderAndType()", () => {
    it("returns null when no record exists", async () => {
      handle.setConfig({ rawRows: [] });
      const result = await repo.findByOrderAndType("order-1", "ORDER_CONFIRMATION");
      expect(result).toBeNull();
    });

    it("maps DB row to EmailSendAttemptRow", async () => {
      handle.setConfig({
        rawRows: [attemptRow({ id: "att-42", orderId: "order-99", emailType: "REFUND_NOTIFICATION", attemptCount: 2 })],
      });
      const result = await repo.findByOrderAndType("order-99", "REFUND_NOTIFICATION");
      expect(result).not.toBeNull();
      expect(result?.id).toBe("att-42");
      expect(result?.orderId).toBe("order-99");
      expect(result?.emailType).toBe("REFUND_NOTIFICATION");
      expect(result?.attemptCount).toBe(2);
    });

    it("issues a SELECT query", async () => {
      handle.setConfig({ rawRows: [] });
      await repo.findByOrderAndType("order-1", "ORDER_CONFIRMATION");
      const selectCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("select"));
      expect(selectCall).toBeDefined();
    });
  });

  describe("create()", () => {
    it("inserts a new record and returns it with attemptCount = 0", async () => {
      const result = await repo.create("order-5", "ORDER_CONFIRMATION");
      expect(result.orderId).toBe("order-5");
      expect(result.emailType).toBe("ORDER_CONFIRMATION");
      expect(result.attemptCount).toBe(0);
      expect(result.lastError).toBeNull();
      expect(result.id).toBeDefined();
    });

    it("issues an INSERT query", async () => {
      await repo.create("order-5", "ORDER_CONFIRMATION");
      const insertCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("insert"));
      expect(insertCall).toBeDefined();
    });
  });

  describe("recordFailedAttempt()", () => {
    it("increments attempt_count and returns the new count", async () => {
      handle.setConfig({ rawRows: [attemptRow({ id: "att-1", attemptCount: 1 })] });
      const newCount = await repo.recordFailedAttempt("att-1", "send error");
      expect(newCount).toBe(2);
    });

    it("issues both a SELECT and an UPDATE query", async () => {
      handle.setConfig({ rawRows: [attemptRow({ id: "att-1", attemptCount: 0 })] });
      await repo.recordFailedAttempt("att-1", "err");
      const selectCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("select"));
      const updateCall = handle.calls.find((c) => c.sql.toLowerCase().startsWith("update"));
      expect(selectCall).toBeDefined();
      expect(updateCall).toBeDefined();
    });

    it("throws when record is not found", async () => {
      handle.setConfig({ rawRows: [] });
      await expect(repo.recordFailedAttempt("nonexistent", "err")).rejects.toThrow(
        "EmailSendAttempt not found: nonexistent",
      );
    });
  });
});
