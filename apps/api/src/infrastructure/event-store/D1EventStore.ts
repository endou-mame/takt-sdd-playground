import { drizzle } from "drizzle-orm/d1";
import { eq, asc } from "drizzle-orm";
import { domainEvents } from "../../../db/schema";
import type { EventStore, StoredEvent } from "./EventStore";

type Db = ReturnType<typeof drizzle>;

export class D1EventStore implements EventStore {
  private readonly db: Db;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async append(
    aggregateId: string,
    aggregateType: string,
    events: readonly { type: string; payload: unknown }[],
    expectedVersion: number,
  ): Promise<void> {
    if (events.length === 0) return;

    let nextVersion = expectedVersion + 1;

    await this.db.transaction(async (tx) => {
      for (const event of events) {
        try {
          await tx.insert(domainEvents).values({
            id: crypto.randomUUID(),
            aggregateId,
            aggregateType,
            version: nextVersion,
            eventType: event.type,
            payload: JSON.stringify(event.payload),
            createdAt: new Date().toISOString(),
          });
        } catch (err) {
          // drizzle-orm wraps the original DB error in DrizzleQueryError,
          // so we must also check err.cause for the underlying constraint message.
          if (err instanceof Error) {
            const isUniqueViolation =
              err.message.includes("UNIQUE constraint failed") ||
              (err.cause instanceof Error &&
                err.cause.message.includes("UNIQUE constraint failed"));
            if (isUniqueViolation) {
              throw { code: "VERSION_CONFLICT" as const };
            }
          }
          throw err;
        }
        nextVersion++;
      }
    });
  }

  async loadEvents(aggregateId: string): Promise<readonly StoredEvent[]> {
    const rows = await this.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.aggregateId, aggregateId))
      .orderBy(asc(domainEvents.version));

    return rows.map((row) => ({
      id: row.id,
      aggregateId: row.aggregateId,
      aggregateType: row.aggregateType,
      version: row.version,
      eventType: row.eventType,
      payload: JSON.parse(row.payload) as unknown,
      createdAt: row.createdAt,
    }));
  }
}
