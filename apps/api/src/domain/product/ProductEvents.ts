import type { DomainEventEnvelope } from "../shared/DomainEvent";

export type ProductEvent =
  | {
      readonly type: "ProductCreated";
      readonly productId: string;
      readonly name: string;
      readonly description: string;
      readonly price: number;
      readonly categoryId: string;
      readonly stock: number;
    }
  | {
      readonly type: "ProductUpdated";
      readonly productId: string;
      readonly changes: Partial<{
        readonly name: string;
        readonly description: string;
        readonly price: number;
        readonly categoryId: string;
      }>;
    }
  | {
      readonly type: "ProductDeleted";
      readonly productId: string;
    }
  | {
      // Administrator direct stock update
      readonly type: "StockUpdated";
      readonly productId: string;
      readonly quantity: number;
    }
  | {
      // Stock decrease triggered by an order placement
      readonly type: "StockDecreased";
      readonly productId: string;
      readonly quantity: number;
      readonly orderId: string;
    }
  | {
      // Stock restoration triggered by an order cancellation
      readonly type: "StockIncreased";
      readonly productId: string;
      readonly quantity: number;
      readonly orderId: string;
    }
  | {
      readonly type: "ProductImageAssociated";
      readonly productId: string;
      readonly imageUrl: string;
    };

export type ProductEventEnvelope = DomainEventEnvelope<ProductEvent>;
