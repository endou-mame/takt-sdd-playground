import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleEmailQueue } from "../EmailQueueConsumer";
import { createD1MockHandle } from "../../repository/__tests__/d1MockFactory";
import type { EmailQueueMessage } from "../EmailQueueProducer";

// emailSendAttempts column order: id, orderId, emailType, attemptCount, lastError, createdAt, updatedAt
function attemptRow(attemptCount = 0): unknown[] {
  return ["att-1", "order-1", "ORDER_CONFIRMATION", attemptCount, null, "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z"];
}

function makeMessage(body: EmailQueueMessage): {
  body: EmailQueueMessage;
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
  id: string;
  timestamp: Date;
  attempts: number;
} {
  return {
    body,
    id: "msg-1",
    timestamp: new Date(),
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function makeBatch(messages: ReturnType<typeof makeMessage>[]): MessageBatch<EmailQueueMessage> {
  return {
    queue: "email-queue",
    messages: messages as unknown as Message<EmailQueueMessage>[],
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  };
}

const orderConfirmationMessage: EmailQueueMessage = {
  type: "ORDER_CONFIRMATION",
  orderId: "order-1",
  params: {
    to: "user@example.com",
    orderId: "order-1",
    items: [{ name: "Widget", quantity: 1, subtotal: 1000 }],
    subtotal: 1000,
    shippingFee: 500,
    total: 1500,
    shippingAddress: {
      recipientName: "Test User",
      postalCode: "100-0001",
      prefecture: "Tokyo",
      city: "Chiyoda",
      street: "1-1",
    },
  },
};

describe("handleEmailQueue", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("acks the message on successful email send", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "resend-id" }),
    });

    const { d1 } = createD1MockHandle();
    const emailQueue = { send: vi.fn().mockResolvedValue(undefined) };
    const msg = makeMessage(orderConfirmationMessage);
    const batch = makeBatch([msg]);

    await handleEmailQueue(batch, {
      RESEND_API_KEY: "test-key",
      RESEND_FROM_ADDRESS: "noreply@example.com",
      EVENTS_DB: d1,
      EMAIL_QUEUE: emailQueue as unknown as Queue<EmailQueueMessage>,
    });

    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it("acks the message even when email send fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "Internal Server Error" }),
    });

    const handle = createD1MockHandle();
    // findByOrderAndType returns an existing attempt record so create() is skipped.
    // recordFailedAttempt SELECT returns attemptCount=1 → newCount=2 < MAX_ATTEMPTS(3) → re-enqueue
    handle.setConfig({ rawRows: [attemptRow(1)] });

    const emailQueue = { send: vi.fn().mockResolvedValue(undefined) };
    const msg = makeMessage(orderConfirmationMessage);
    const batch = makeBatch([msg]);

    await handleEmailQueue(batch, {
      RESEND_API_KEY: "test-key",
      RESEND_FROM_ADDRESS: "noreply@example.com",
      EVENTS_DB: handle.d1,
      EMAIL_QUEUE: emailQueue as unknown as Queue<EmailQueueMessage>,
    });

    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it("does not re-enqueue when max retries are reached", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "Failure" }),
    });

    const handle = createD1MockHandle();
    // attemptCount=2, so newCount=3 which equals MAX_ATTEMPTS → no re-enqueue
    handle.setConfig({ rawRows: [attemptRow(2)] });

    const emailQueue = { send: vi.fn().mockResolvedValue(undefined) };
    const msg = makeMessage(orderConfirmationMessage);
    const batch = makeBatch([msg]);

    await handleEmailQueue(batch, {
      RESEND_API_KEY: "test-key",
      RESEND_FROM_ADDRESS: "noreply@example.com",
      EVENTS_DB: handle.d1,
      EMAIL_QUEUE: emailQueue as unknown as Queue<EmailQueueMessage>,
    });

    expect(emailQueue.send).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalledOnce();
  });
});
