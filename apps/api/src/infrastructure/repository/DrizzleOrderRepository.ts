import { drizzle } from "drizzle-orm/d1";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { ordersRm } from "../../../db/schema";

type Db = ReturnType<typeof drizzle>;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type OrderItem = {
  readonly productId: string;
  readonly name: string;
  readonly price: number;
  readonly quantity: number;
};

export type ShippingAddress = {
  readonly postalCode: string;
  readonly prefecture: string;
  readonly city: string;
  readonly street: string;
  readonly name: string;
  readonly phone: string;
};

export type OrderRow = {
  readonly id: string;
  readonly customerId: string;
  readonly status: string;
  readonly items: OrderItem[];
  readonly shippingAddress: ShippingAddress;
  readonly paymentMethod: string;
  readonly subtotal: number;
  readonly shippingFee: number;
  readonly total: number;
  readonly paymentCode: string | null;
  readonly paymentExpiresAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AdminOrderFilter = {
  readonly status?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly page?: number;
  readonly limit?: number;
};

export interface OrderReadRepository {
  listOrdersByCustomer(customerId: string): Promise<OrderRow[]>;
  getOrderById(id: string): Promise<OrderRow | null>;
  verifyOwnership(orderId: string, customerId: string): Promise<boolean>;
  listAllOrders(
    filter: AdminOrderFilter,
  ): Promise<{ items: OrderRow[]; total: number }>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DrizzleOrderRepository implements OrderReadRepository {
  private readonly db: Db;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async listOrdersByCustomer(customerId: string): Promise<OrderRow[]> {
    const rows = await this.db
      .select()
      .from(ordersRm)
      .where(eq(ordersRm.customerId, customerId))
      .orderBy(desc(ordersRm.createdAt));

    return rows.map(toOrderRow);
  }

  async getOrderById(id: string): Promise<OrderRow | null> {
    const rows = await this.db
      .select()
      .from(ordersRm)
      .where(eq(ordersRm.id, id));

    const row = rows[0];
    return row ? toOrderRow(row) : null;
  }

  async verifyOwnership(
    orderId: string,
    customerId: string,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: ordersRm.id })
      .from(ordersRm)
      .where(and(eq(ordersRm.id, orderId), eq(ordersRm.customerId, customerId)));

    return rows.length > 0;
  }

  async listAllOrders(
    filter: AdminOrderFilter,
  ): Promise<{ items: OrderRow[]; total: number }> {
    const page = filter.page ?? 1;
    const limit = Math.min(filter.limit ?? 50, 50);
    const offset = (page - 1) * limit;

    const conditions = buildAdminOrderConditions(filter);

    const rows = await this.db
      .select()
      .from(ordersRm)
      .where(conditions)
      .orderBy(desc(ordersRm.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(ordersRm)
      .where(conditions);

    const total = countResult[0]?.count ?? 0;

    return { items: rows.map(toOrderRow), total };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAdminOrderConditions(filter: AdminOrderFilter) {
  const clauses = [];

  if (filter.status !== undefined) {
    clauses.push(eq(ordersRm.status, filter.status));
  }
  if (filter.fromDate !== undefined) {
    clauses.push(gte(ordersRm.createdAt, filter.fromDate));
  }
  if (filter.toDate !== undefined) {
    clauses.push(lte(ordersRm.createdAt, filter.toDate));
  }

  return clauses.length > 0 ? and(...clauses) : undefined;
}

function toOrderRow(row: typeof ordersRm.$inferSelect): OrderRow {
  return {
    id: row.id,
    customerId: row.customerId,
    status: row.status,
    items: JSON.parse(row.items) as OrderItem[],
    shippingAddress: JSON.parse(row.shippingAddress) as ShippingAddress,
    paymentMethod: row.paymentMethod,
    subtotal: row.subtotal,
    shippingFee: row.shippingFee,
    total: row.total,
    paymentCode: row.paymentCode ?? null,
    paymentExpiresAt: row.paymentExpiresAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
