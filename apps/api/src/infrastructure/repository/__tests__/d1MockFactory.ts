/**
 * Configurable D1 mock for repository unit tests.
 *
 * Drizzle ORM calls d1.prepare(sql).bind(...params).raw() for typed SELECT
 * queries. raw() must return rows as value arrays in schema-column order so
 * Drizzle can reconstruct typed objects via its field mappings.
 *
 * COUNT queries use select({ count: sql<number>`count(*)` }) — Drizzle calls
 * raw() and maps the first value to the count field, so raw() should return
 * [[N]] for those queries.
 */

const EMPTY_META = {
  duration: 0,
  size_after: 0,
  rows_read: 0,
  rows_written: 0,
  last_row_id: 0,
  changed_db: false,
  changes: 0,
} as const;

export type CapturedCall = { sql: string; params: unknown[] };

export type MockConfig = {
  /**
   * Rows returned for SELECT raw() calls (value-arrays in column order).
   * Defaults to [].
   */
  rawRows?: unknown[][];
  /**
   * Count value returned for COUNT(*) SELECT queries.
   * Drizzle maps raw() result [[N]] to { count: N }.
   * Defaults to 0.
   */
  countValue?: number;
  /**
   * If set, the next INSERT run() call throws this error.
   */
  insertError?: Error;
};

export type D1MockHandle = {
  d1: D1Database;
  calls: CapturedCall[];
  setConfig(config: MockConfig): void;
};

export function createD1MockHandle(): D1MockHandle {
  const calls: CapturedCall[] = [];
  let config: MockConfig = {};

  function makeStatement(sql: string, params: unknown[]): D1PreparedStatement {
    const lower = sql.toLowerCase().trimStart();

    const stmt = {
      bind(...values: unknown[]): D1PreparedStatement {
        return makeStatement(sql, values);
      },

      async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        calls.push({ sql, params });

        if (isTransactionControl(lower)) {
          return { success: true, results: [] as T[], meta: { ...EMPTY_META } };
        }

        if (config.insertError && lower.startsWith("insert")) {
          const err = config.insertError;
          const { insertError: _, ...rest } = config;
          config = rest;
          throw err;
        }

        return { success: true, results: [] as T[], meta: { ...EMPTY_META } };
      },

      async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        calls.push({ sql, params });
        return { success: true, results: [] as T[], meta: { ...EMPTY_META } };
      },

      async first<T = Record<string, unknown>>(): Promise<T | null> {
        calls.push({ sql, params });
        return null;
      },

      async raw<T = unknown[]>(): Promise<T[]> {
        calls.push({ sql, params });

        if (lower.includes("count(*)")) {
          const count = config.countValue ?? 0;
          return [[count]] as unknown as T[];
        }

        return (config.rawRows ?? []) as unknown as T[];
      },
    };

    return stmt as unknown as D1PreparedStatement;
  }

  const d1: D1Database = {
    prepare(query: string): D1PreparedStatement {
      return makeStatement(query, []);
    },
    batch<T>(): Promise<D1Result<T>[]> {
      throw new Error("batch() not implemented");
    },
    exec(): Promise<D1ExecResult> {
      throw new Error("exec() not implemented");
    },
    withSession(): D1DatabaseSession {
      throw new Error("withSession() not implemented");
    },
    dump(): Promise<ArrayBuffer> {
      throw new Error("dump() not implemented");
    },
  } as unknown as D1Database;

  return { d1, calls, setConfig: (c) => { config = c; } };
}

function isTransactionControl(lower: string): boolean {
  return (
    lower.startsWith("begin") ||
    lower.startsWith("commit") ||
    lower.startsWith("rollback") ||
    lower.startsWith("savepoint") ||
    lower.startsWith("release")
  );
}
