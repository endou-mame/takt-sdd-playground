/**
 * Unit tests for D1EventStore using an in-memory D1 mock.
 *
 * @cloudflare/vitest-pool-workers is not compatible with vitest 4.x (supports
 * 2.x–3.x only), so we use a lightweight in-memory mock that simulates D1's
 * SQLite behaviour including the UNIQUE constraint on (aggregate_id, version).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { D1EventStore } from "../D1EventStore";

// ---------------------------------------------------------------------------
// Mock D1 Database
// ---------------------------------------------------------------------------

type EventRow = {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  version: number;
  event_type: string;
  payload: string;
  created_at: string;
};

const EMPTY_META = {
  duration: 0,
  size_after: 0,
  rows_read: 0,
  rows_written: 0,
  last_row_id: 0,
  changed_db: false,
  changes: 0,
} as const;

function createD1Mock(): D1Database {
  const rows: EventRow[] = [];

  function makeStatement(sql: string, params: unknown[]): D1PreparedStatement {
    const lower = sql.toLowerCase().trimStart();

    const stmt: {
      bind(...values: unknown[]): D1PreparedStatement;
      run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
      all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
      first<T = Record<string, unknown>>(col?: string): Promise<T | null>;
      raw<T = unknown[]>(opts?: { columnNames?: boolean }): Promise<T[]>;
    } = {
      bind(...values: unknown[]): D1PreparedStatement {
        return makeStatement(sql, values);
      },

      async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        // No-op for transaction control statements
        if (
          lower.startsWith("begin") ||
          lower.startsWith("commit") ||
          lower.startsWith("rollback") ||
          lower.startsWith("savepoint") ||
          lower.startsWith("release") ||
          lower === "begin deferred" ||
          lower === "begin immediate" ||
          lower === "begin exclusive"
        ) {
          return {
            success: true,
            results: [] as T[],
            meta: { ...EMPTY_META },
          };
        }

        // INSERT: parse column names from SQL, check UNIQUE constraint
        if (lower.startsWith("insert")) {
          const colMatch = sql.match(/\(([^)]+)\)\s+values/i);
          if (!colMatch?.[1]) throw new Error(`Cannot parse INSERT SQL: ${sql}`);

          // Drizzle may quote identifiers with backticks or double quotes
          const cols = colMatch[1]
            .split(",")
            .map((c) => c.trim().replace(/[`"]/g, ""));

          const row: Record<string, unknown> = {};
          cols.forEach((col, i) => {
            row[col] = params[i];
          });

          const aggregateId = row["aggregate_id"] as string;
          const version = row["version"] as number;
          const exists = rows.some(
            (r) => r.aggregate_id === aggregateId && r.version === version,
          );
          if (exists) {
            throw new Error(
              "UNIQUE constraint failed: domain_events.aggregate_id, domain_events.version",
            );
          }

          rows.push(row as unknown as EventRow);
        }

        return {
          success: true,
          results: [] as T[],
          meta: { ...EMPTY_META },
        };
      },

      async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        // SELECT: filter by aggregate_id (first param), sort by version asc.
        // Returns columns in schema-definition order so drizzle's mapResultRow
        // receives values in the correct position.
        const aggregateId = params[0] as string;
        const filtered = rows
          .filter((r) => r.aggregate_id === aggregateId)
          .sort((a, b) => a.version - b.version)
          .map((r) => ({
            id: r.id,
            aggregate_type: r.aggregate_type,
            aggregate_id: r.aggregate_id,
            version: r.version,
            event_type: r.event_type,
            payload: r.payload,
            created_at: r.created_at,
          })) as unknown as T[];

        return {
          success: true,
          results: filtered,
          meta: { ...EMPTY_META },
        };
      },

      async first<T = Record<string, unknown>>(): Promise<T | null> {
        throw new Error("first() not implemented in D1 mock");
      },

      // drizzle-orm calls raw() (not all()) when field mappings are present,
      // which is the case for explicit select().from(table) queries.
      // raw() must return rows as value arrays in SELECT column order.
      async raw<T = unknown[]>(): Promise<T[]> {
        if (lower.startsWith("select")) {
          const aggregateId = params[0] as string;
          const filtered = rows
            .filter((r) => r.aggregate_id === aggregateId)
            .sort((a, b) => a.version - b.version)
            .map((r) => [
              r.id,
              r.aggregate_type,
              r.aggregate_id,
              r.version,
              r.event_type,
              r.payload,
              r.created_at,
            ]) as unknown as T[];
          return filtered;
        }
        throw new Error(`raw() not implemented for this SQL: ${sql}`);
      },
    };

    return stmt as unknown as D1PreparedStatement;
  }

  return {
    prepare(query: string): D1PreparedStatement {
      return makeStatement(query, []);
    },
    batch<T>(): Promise<D1Result<T>[]> {
      throw new Error("batch() not implemented in D1 mock");
    },
    exec(): Promise<D1ExecResult> {
      throw new Error("exec() not implemented in D1 mock");
    },
    withSession(): D1DatabaseSession {
      throw new Error("withSession() not implemented in D1 mock");
    },
    dump(): Promise<ArrayBuffer> {
      throw new Error("dump() not implemented in D1 mock");
    },
  } as unknown as D1Database;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("D1EventStore", () => {
  let store: D1EventStore;

  beforeEach(() => {
    store = new D1EventStore(createD1Mock());
  });

  describe("append()", () => {
    it("inserts the first event at version = expectedVersion + 1", async () => {
      await store.append(
        "agg-1",
        "Order",
        [{ type: "OrderCreated", payload: { orderId: "agg-1" } }],
        0,
      );

      const events = await store.loadEvents("agg-1");
      expect(events).toHaveLength(1);
      expect(events[0]?.version).toBe(1);
      expect(events[0]?.eventType).toBe("OrderCreated");
      expect(events[0]?.aggregateType).toBe("Order");
    });

    it("inserts multiple events with consecutive versions", async () => {
      await store.append(
        "agg-2",
        "Order",
        [
          { type: "OrderCreated", payload: { seq: 1 } },
          { type: "PaymentReceived", payload: { seq: 2 } },
          { type: "OrderShipped", payload: { seq: 3 } },
        ],
        0,
      );

      const events = await store.loadEvents("agg-2");
      expect(events).toHaveLength(3);
      expect(events[0]?.version).toBe(1);
      expect(events[1]?.version).toBe(2);
      expect(events[2]?.version).toBe(3);
    });

    it("throws VERSION_CONFLICT when the same expectedVersion is used twice", async () => {
      await store.append(
        "agg-3",
        "Order",
        [{ type: "OrderCreated", payload: {} }],
        0,
      );

      // Second write with the same expectedVersion=0 attempts to insert version=1 again
      await expect(
        store.append(
          "agg-3",
          "Order",
          [{ type: "OrderUpdated", payload: {} }],
          0,
        ),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    });

    it("returns immediately without inserting when events array is empty", async () => {
      await expect(
        store.append("agg-4", "Order", [], 0),
      ).resolves.toBeUndefined();

      const events = await store.loadEvents("agg-4");
      expect(events).toHaveLength(0);
    });
  });

  describe("loadEvents()", () => {
    it("returns events in ascending version order", async () => {
      await store.append(
        "agg-5",
        "Order",
        [
          { type: "Event1", payload: { seq: 1 } },
          { type: "Event2", payload: { seq: 2 } },
        ],
        0,
      );

      const events = await store.loadEvents("agg-5");
      expect(events[0]?.eventType).toBe("Event1");
      expect(events[1]?.eventType).toBe("Event2");
    });

    it("deserialises payload from JSON", async () => {
      const originalPayload = { orderId: "x-1", amount: 1500 };
      await store.append(
        "agg-6",
        "Order",
        [{ type: "OrderCreated", payload: originalPayload }],
        0,
      );

      const events = await store.loadEvents("agg-6");
      expect(events[0]?.payload).toEqual(originalPayload);
    });

    it("returns an empty array when no events exist for the aggregate", async () => {
      const events = await store.loadEvents("nonexistent-aggregate");
      expect(events).toEqual([]);
    });

    it("isolates events by aggregateId", async () => {
      await store.append(
        "agg-7",
        "Order",
        [{ type: "OrderCreated", payload: {} }],
        0,
      );
      await store.append(
        "agg-8",
        "Order",
        [{ type: "OrderCreated", payload: {} }],
        0,
      );

      const events7 = await store.loadEvents("agg-7");
      const events8 = await store.loadEvents("agg-8");
      expect(events7).toHaveLength(1);
      expect(events8).toHaveLength(1);
    });
  });
});
