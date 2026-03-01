import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { ordersRm } from "../../../db/schema";
import type { OrderEvent } from "../../domain/order/OrderEvents";

type Db = ReturnType<typeof drizzle>;

export class OrderProjection {
  private readonly db: Db;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async apply(event: OrderEvent): Promise<void> {
    const now = new Date().toISOString();

    switch (event.type) {
      case "OrderCreated": {
        // Application layer always appends OrderCreated + PaymentCompleted (or
        // ConvenienceStorePaymentIssued) in the same EventStore.append() call,
        // so no intermediate state is visible externally.
        await this.db.insert(ordersRm).values({
          id: event.orderId,
          customerId: event.customerId,
          status: "ACCEPTED",
          items: JSON.stringify(event.items),
          shippingAddress: JSON.stringify(event.shippingAddress),
          paymentMethod: event.paymentMethod,
          subtotal: event.subtotal,
          shippingFee: event.shippingFee,
          total: event.total,
          paymentCode: null,
          paymentExpiresAt: null,
          createdAt: now,
          updatedAt: now,
        });
        break;
      }

      case "PaymentCompleted": {
        await this.db
          .update(ordersRm)
          .set({ status: "ACCEPTED", updatedAt: now })
          .where(eq(ordersRm.id, event.orderId));
        break;
      }

      case "ConvenienceStorePaymentIssued": {
        await this.db
          .update(ordersRm)
          .set({ paymentCode: event.paymentCode, paymentExpiresAt: event.expiresAt, updatedAt: now })
          .where(eq(ordersRm.id, event.orderId));
        break;
      }

      case "OrderShipped": {
        await this.db
          .update(ordersRm)
          .set({ status: "SHIPPED", updatedAt: now })
          .where(eq(ordersRm.id, event.orderId));
        break;
      }

      case "OrderCompleted": {
        await this.db
          .update(ordersRm)
          .set({ status: "COMPLETED", updatedAt: now })
          .where(eq(ordersRm.id, event.orderId));
        break;
      }

      case "OrderCancelled": {
        await this.db
          .update(ordersRm)
          .set({ status: "CANCELLED", updatedAt: now })
          .where(eq(ordersRm.id, event.orderId));
        break;
      }

      case "RefundCompleted":
        // No read-model update needed for refund completion
        break;
    }
  }
}
