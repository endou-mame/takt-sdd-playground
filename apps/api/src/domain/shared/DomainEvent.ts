/**
 * Generic envelope for all domain events stored in the event store.
 * Concrete event payloads (ProductEvent, OrderEvent, UserEvent) are defined
 * in their respective aggregate modules (Task 4.x).
 */
export type DomainEventEnvelope<TPayload> = {
  readonly id: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly version: number;
  readonly occurredAt: string; // ISO-8601 timestamp
  readonly payload: TPayload;
};
