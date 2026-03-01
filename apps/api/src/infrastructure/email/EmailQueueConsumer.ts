import { ResendEmailService } from "./ResendEmailService";
import { EmailRetryRepository, MAX_ATTEMPTS } from "./EmailRetryRepository";
import type { EmailQueueMessage } from "./EmailQueueProducer";

// Subset of Bindings required by the queue consumer.
// Defined here to avoid circular imports with worker.ts.
type EmailQueueEnv = {
  readonly RESEND_API_KEY: string;
  readonly RESEND_FROM_ADDRESS: string;
  readonly EVENTS_DB: D1Database;
  readonly EMAIL_QUEUE: Queue<EmailQueueMessage>;
};

export async function handleEmailQueue(
  batch: MessageBatch<EmailQueueMessage>,
  env: EmailQueueEnv,
): Promise<void> {
  const emailService = new ResendEmailService(env.RESEND_API_KEY, env.RESEND_FROM_ADDRESS);
  const retryRepo = new EmailRetryRepository(env.EVENTS_DB);

  for (const msg of batch.messages) {
    const body = msg.body;
    try {
      if (body.type === "ORDER_CONFIRMATION") {
        await emailService.sendOrderConfirmation(body.params);
      } else {
        await emailService.sendRefundNotification(body.params);
      }
      msg.ack();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const record =
        (await retryRepo.findByOrderAndType(body.orderId, body.type)) ??
        (await retryRepo.create(body.orderId, body.type));
      const newCount = await retryRepo.recordFailedAttempt(record.id, errMsg);

      if (newCount < MAX_ATTEMPTS) {
        // Re-enqueue with 30-minute delay so transient failures are retried
        await env.EMAIL_QUEUE.send(body, { delaySeconds: 1800 });
      } else {
        console.error(
          `[EmailQueue] Max retry reached orderId=${body.orderId} type=${body.type} error=${errMsg}`,
        );
      }
      // Always ack to prevent Cloudflare's automatic retry; D1-based retry is self-managed
      msg.ack();
    }
  }
}
