import { describe, it, expect, beforeEach, vi } from "vitest";
import { CloudflareEmailQueueProducer } from "../EmailQueueProducer";
import type { EmailRetryRepository, EmailSendAttemptRow } from "../EmailRetryRepository";
import type { OrderConfirmationParams, RefundNotificationParams } from "../EmailService";

function makeRow(overrides: Partial<EmailSendAttemptRow> = {}): EmailSendAttemptRow {
  return {
    id: "att-1",
    orderId: "order-1",
    emailType: "ORDER_CONFIRMATION",
    attemptCount: 0,
    lastError: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeRetryRepo(overrides: Partial<EmailRetryRepository> = {}): EmailRetryRepository {
  return {
    findByOrderAndType: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(makeRow()),
    recordFailedAttempt: vi.fn().mockResolvedValue(1),
    ...overrides,
  } as unknown as EmailRetryRepository;
}

const orderConfirmationParams: OrderConfirmationParams = {
  to: "user@example.com",
  orderId: "order-1",
  items: [{ name: "Widget", quantity: 2, subtotal: 2000 }],
  subtotal: 2000,
  shippingFee: 500,
  total: 2500,
  shippingAddress: {
    recipientName: "Test User",
    postalCode: "100-0001",
    prefecture: "Tokyo",
    city: "Chiyoda",
    street: "1-1",
  },
};

const refundNotificationParams: RefundNotificationParams = {
  to: "user@example.com",
  orderId: "order-2",
  amount: 1500,
};

describe("CloudflareEmailQueueProducer", () => {
  let queue: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    queue = { send: vi.fn().mockResolvedValue(undefined) };
  });

  describe("enqueueOrderConfirmation()", () => {
    it("creates a retry record and sends the message when none exists", async () => {
      const retryRepo = makeRetryRepo();
      const producer = new CloudflareEmailQueueProducer(
        queue as unknown as Queue,
        retryRepo,
      );

      await producer.enqueueOrderConfirmation(orderConfirmationParams);

      expect(retryRepo.findByOrderAndType).toHaveBeenCalledWith("order-1", "ORDER_CONFIRMATION");
      expect(retryRepo.create).toHaveBeenCalledWith("order-1", "ORDER_CONFIRMATION");
      expect(queue.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "ORDER_CONFIRMATION", orderId: "order-1" }),
      );
    });

    it("skips sending when a retry record already exists (idempotency)", async () => {
      const retryRepo = makeRetryRepo({
        findByOrderAndType: vi.fn().mockResolvedValue(makeRow()),
      });
      const producer = new CloudflareEmailQueueProducer(
        queue as unknown as Queue,
        retryRepo,
      );

      await producer.enqueueOrderConfirmation(orderConfirmationParams);

      expect(retryRepo.create).not.toHaveBeenCalled();
      expect(queue.send).not.toHaveBeenCalled();
    });
  });

  describe("enqueueRefundNotification()", () => {
    it("creates a retry record and sends the message when none exists", async () => {
      const retryRepo = makeRetryRepo();
      const producer = new CloudflareEmailQueueProducer(
        queue as unknown as Queue,
        retryRepo,
      );

      await producer.enqueueRefundNotification(refundNotificationParams);

      expect(retryRepo.findByOrderAndType).toHaveBeenCalledWith("order-2", "REFUND_NOTIFICATION");
      expect(retryRepo.create).toHaveBeenCalledWith("order-2", "REFUND_NOTIFICATION");
      expect(queue.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "REFUND_NOTIFICATION", orderId: "order-2" }),
      );
    });

    it("skips sending when already enqueued (idempotency)", async () => {
      const retryRepo = makeRetryRepo({
        findByOrderAndType: vi.fn().mockResolvedValue(makeRow({ emailType: "REFUND_NOTIFICATION" })),
      });
      const producer = new CloudflareEmailQueueProducer(
        queue as unknown as Queue,
        retryRepo,
      );

      await producer.enqueueRefundNotification(refundNotificationParams);

      expect(queue.send).not.toHaveBeenCalled();
    });
  });
});
