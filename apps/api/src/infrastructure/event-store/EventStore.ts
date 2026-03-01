/**
 * A single event retrieved from the event store, with its persisted metadata.
 */
export type StoredEvent = {
  readonly id: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly version: number;
  readonly eventType: string;
  readonly payload: unknown;
  readonly createdAt: string; // ISO-8601
};

/**
 * Append-only event store interface.
 *
 * Application-layer use cases depend on this interface; concrete implementations
 * (e.g. D1EventStore) live in the infrastructure layer so the domain stays
 * framework-independent.
 */
export interface EventStore {
  /**
   * Appends events for an aggregate, assigning consecutive versions starting
   * at expectedVersion + 1.
   *
   * Throws `{ code: 'VERSION_CONFLICT' }` if another writer has already
   * written to the same (aggregateId, version) slot (optimistic locking).
   */
  append(
    aggregateId: string,
    aggregateType: string,
    events: readonly { type: string; payload: unknown }[],
    expectedVersion: number,
  ): Promise<void>;

  /**
   * Returns all events for the given aggregate, ordered by version ascending.
   * Returns an empty array when no events exist.
   */
  loadEvents(aggregateId: string): Promise<readonly StoredEvent[]>;
}
