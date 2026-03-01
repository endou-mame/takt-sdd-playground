import type { OrderConfirmationParams, RefundNotificationParams } from "./EmailService";
import type { EmailRetryRepository } from "./EmailRetryRepository";

export type EmailQueueMessage =
  | {
      readonly type: "ORDER_CONFIRMATION";
      readonly orderId: string;
      readonly params: OrderConfirmationParams;
    }
  | {
      readonly type: "REFUND_NOTIFICATION";
      readonly orderId: string;
      readonly params: RefundNotificationParams;
    };

export interface EmailQueueProducer {
  enqueueOrderConfirmation(params: OrderConfirmationParams): Promise<void>;
  enqueueRefundNotification(params: RefundNotificationParams): Promise<void>;
}

export class CloudflareEmailQueueProducer implements EmailQueueProducer {
  constructor(
    private readonly queue: Queue<EmailQueueMessage>,
    private readonly retryRepo: EmailRetryRepository,
  ) {}

  async enqueueOrderConfirmation(params: OrderConfirmationParams): Promise<void> {
    // Idempotency: skip if a send attempt record already exists
    const existing = await this.retryRepo.findByOrderAndType(params.orderId, "ORDER_CONFIRMATION");
    if (existing) return;

    await this.retryRepo.create(params.orderId, "ORDER_CONFIRMATION");
    await this.queue.send({ type: "ORDER_CONFIRMATION", orderId: params.orderId, params });
  }

  async enqueueRefundNotification(params: RefundNotificationParams): Promise<void> {
    const existing = await this.retryRepo.findByOrderAndType(params.orderId, "REFUND_NOTIFICATION");
    if (existing) return;

    await this.retryRepo.create(params.orderId, "REFUND_NOTIFICATION");
    await this.queue.send({ type: "REFUND_NOTIFICATION", orderId: params.orderId, params });
  }
}
