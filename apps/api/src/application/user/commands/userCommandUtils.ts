import type { EventStore } from "../../../infrastructure/event-store/EventStore";

export async function loadCurrentVersion(aggregateId: string, eventStore: EventStore): Promise<number> {
  const events = await eventStore.loadEvents(aggregateId);
  return events[events.length - 1]?.version ?? 0;
}
