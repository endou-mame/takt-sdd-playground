import { drizzle } from "drizzle-orm/d1";
import { and, desc, eq, like, or } from "drizzle-orm";
import { addresses, ordersRm, users } from "../../../db/schema";

type Db = ReturnType<typeof drizzle>;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type UserRecord = {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly name: string;
  readonly role: string;
  readonly emailVerified: boolean;
  readonly failedLoginAttempts: number;
  readonly lockedUntil: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

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

export type OrderSummary = {
  readonly id: string;
  readonly status: string;
  readonly total: number;
  readonly createdAt: string;
};

export type CustomerSummary = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
  readonly createdAt: string;
};

export type CustomerDetail = {
  readonly user: UserRecord;
  readonly addresses: AddressRecord[];
  readonly recentOrders: OrderSummary[];
};

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  save(record: UserRecord): Promise<void>;
  update(
    id: string,
    updates: Partial<Omit<UserRecord, "id" | "createdAt">>,
  ): Promise<void>;
  searchCustomers(keyword: string): Promise<CustomerSummary[]>;
  getCustomerDetail(userId: string): Promise<CustomerDetail | null>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DrizzleUserRepository implements UserRepository {
  private readonly db: Db;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email));

    const row = rows[0];
    return row ? toUserRecord(row) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id));

    const row = rows[0];
    return row ? toUserRecord(row) : null;
  }

  async save(record: UserRecord): Promise<void> {
    await this.db.insert(users).values({
      id: record.id,
      email: record.email,
      passwordHash: record.passwordHash,
      name: record.name,
      role: record.role,
      emailVerified: record.emailVerified ? 1 : 0,
      failedLoginAttempts: record.failedLoginAttempts,
      lockedUntil: record.lockedUntil,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async update(
    id: string,
    updates: Partial<Omit<UserRecord, "id" | "createdAt">>,
  ): Promise<void> {
    const values = buildUpdateValues(updates);
    await this.db.update(users).set(values).where(eq(users.id, id));
  }

  async searchCustomers(keyword: string): Promise<CustomerSummary[]> {
    const kw = `%${keyword}%`;
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(or(like(users.name, kw), like(users.email, kw)));

    return rows.map(toCustomerSummary);
  }

  async getCustomerDetail(userId: string): Promise<CustomerDetail | null> {
    const user = await this.findById(userId);
    if (!user) return null;

    const userAddresses = await this.fetchAddresses(userId);
    const recentOrders = await this.fetchRecentOrders(userId);

    return { user, addresses: userAddresses, recentOrders };
  }

  private async fetchAddresses(userId: string): Promise<AddressRecord[]> {
    const rows = await this.db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, userId));

    return rows.map(toAddressRecord);
  }

  private async fetchRecentOrders(userId: string): Promise<OrderSummary[]> {
    const rows = await this.db
      .select({
        id: ordersRm.id,
        status: ordersRm.status,
        total: ordersRm.total,
        createdAt: ordersRm.createdAt,
      })
      .from(ordersRm)
      .where(eq(ordersRm.customerId, userId))
      .orderBy(desc(ordersRm.createdAt))
      .limit(10);

    return rows.map(toOrderSummary);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toUserRecord(row: typeof users.$inferSelect): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    name: row.name,
    role: row.role,
    emailVerified: row.emailVerified === 1,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

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

function toOrderSummary(row: {
  id: string;
  status: string;
  total: number;
  createdAt: string;
}): OrderSummary {
  return {
    id: row.id,
    status: row.status,
    total: row.total,
    createdAt: row.createdAt,
  };
}

function toCustomerSummary(row: {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}): CustomerSummary {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.createdAt,
  };
}

function buildUpdateValues(
  updates: Partial<Omit<UserRecord, "id" | "createdAt">>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  if (updates.email !== undefined) values.email = updates.email;
  if (updates.passwordHash !== undefined)
    values.passwordHash = updates.passwordHash;
  if (updates.name !== undefined) values.name = updates.name;
  if (updates.role !== undefined) values.role = updates.role;
  if (updates.emailVerified !== undefined)
    values.emailVerified = updates.emailVerified ? 1 : 0;
  if (updates.failedLoginAttempts !== undefined)
    values.failedLoginAttempts = updates.failedLoginAttempts;
  if (updates.lockedUntil !== undefined)
    values.lockedUntil = updates.lockedUntil;
  if (updates.updatedAt !== undefined) values.updatedAt = updates.updatedAt;

  return values;
}

