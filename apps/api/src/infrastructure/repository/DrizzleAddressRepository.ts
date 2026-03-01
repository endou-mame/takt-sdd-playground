import { drizzle } from "drizzle-orm/d1";
import { and, eq, sql } from "drizzle-orm";
import { addresses } from "../../../db/schema";

type Db = ReturnType<typeof drizzle>;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AddressRecord = {
  readonly id: string;
  readonly userId: string;
  readonly postalCode: string;
  readonly prefecture: string;
  readonly city: string;
  readonly street: string;
  readonly name: string;
  readonly phone: string;
  readonly createdAt: string;
};

export type CreateAddressInput = {
  readonly id: string;
  readonly userId: string;
  readonly postalCode: string;
  readonly prefecture: string;
  readonly city: string;
  readonly street: string;
  readonly name: string;
  readonly phone: string;
  readonly createdAt: string;
};

export type UpdateAddressInput = {
  readonly postalCode?: string;
  readonly prefecture?: string;
  readonly city?: string;
  readonly street?: string;
  readonly name?: string;
  readonly phone?: string;
};

export interface AddressRepository {
  listByUser(userId: string): Promise<AddressRecord[]>;
  findById(id: string): Promise<AddressRecord | null>;
  create(input: CreateAddressInput): Promise<void>;
  update(id: string, userId: string, input: UpdateAddressInput): Promise<void>;
  delete(id: string, userId: string): Promise<void>;
  countByUser(userId: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DrizzleAddressRepository implements AddressRepository {
  private readonly db: Db;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async listByUser(userId: string): Promise<AddressRecord[]> {
    const rows = await this.db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, userId));

    return rows.map(toAddressRecord);
  }

  async findById(id: string): Promise<AddressRecord | null> {
    const rows = await this.db
      .select()
      .from(addresses)
      .where(eq(addresses.id, id));

    const row = rows[0];
    return row ? toAddressRecord(row) : null;
  }

  async create(input: CreateAddressInput): Promise<void> {
    await this.db.insert(addresses).values({
      id: input.id,
      userId: input.userId,
      postalCode: input.postalCode,
      prefecture: input.prefecture,
      city: input.city,
      street: input.street,
      name: input.name,
      phone: input.phone,
      createdAt: input.createdAt,
    });
  }

  async update(
    id: string,
    userId: string,
    input: UpdateAddressInput,
  ): Promise<void> {
    await this.db
      .update(addresses)
      .set(input)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.db
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
  }

  async countByUser(userId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(addresses)
      .where(eq(addresses.userId, userId));

    return result[0]?.count ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toAddressRecord(row: typeof addresses.$inferSelect): AddressRecord {
  return {
    id: row.id,
    userId: row.userId,
    postalCode: row.postalCode,
    prefecture: row.prefecture,
    city: row.city,
    street: row.street,
    name: row.name,
    phone: row.phone,
    createdAt: row.createdAt,
  };
}
