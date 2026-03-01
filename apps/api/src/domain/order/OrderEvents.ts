import type { DomainEventEnvelope } from "../shared/DomainEvent";
import type { PaymentMethod, ShippingAddress } from "./Order";

export type OrderItemData = {
  readonly productId: string;
  readonly productName: string;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly subtotal: number;
};

export type OrderEvent =
  | {
      readonly type: "OrderCreated";
      readonly orderId: string;
      readonly customerId: string;
      readonly items: readonly OrderItemData[];
      readonly shippingAddress: ShippingAddress;
      readonly paymentMethod: PaymentMethod;
      readonly subtotal: number;
      readonly shippingFee: number;
      readonly total: number;
    }
  | {
      readonly type: "PaymentCompleted";
      readonly orderId: string;
      readonly paymentMethod: PaymentMethod;
      // Only transactionId is stored; card number and CVV are never recorded
      readonly transactionId: string;
    }
  | {
      readonly type: "ConvenienceStorePaymentIssued";
      readonly orderId: string;
      readonly paymentCode: string;
      readonly expiresAt: string; // ISO-8601
    }
  | {
      readonly type: "OrderShipped";
      readonly orderId: string;
    }
  | {
      readonly type: "OrderCompleted";
      readonly orderId: string;
    }
  | {
      readonly type: "OrderCancelled";
      readonly orderId: string;
      readonly reason: string;
    }
  | {
      readonly type: "RefundCompleted";
      readonly orderId: string;
      readonly amount: number;
    };

export type OrderEventEnvelope = DomainEventEnvelope<OrderEvent>;
