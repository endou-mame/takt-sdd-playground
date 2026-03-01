import { drizzle } from "drizzle-orm/d1";
import { eq, and, or, like, gte, lte, sql } from "drizzle-orm";
import { productsRm } from "../../../db/schema";

type Db = ReturnType<typeof drizzle>;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ListProductsFilter = {
  readonly keyword?: string;
  readonly categoryId?: string;
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly page?: number;
  readonly limit?: number;
};

export type ProductRow = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly categoryId: string;
  readonly stock: number;
  readonly stockStatus: string;
  readonly status: string;
  readonly imageUrls: string[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export interface ProductReadRepository {
  listProducts(
    filter: ListProductsFilter,
  ): Promise<{ items: ProductRow[]; total: number }>;
  getProductById(id: string): Promise<ProductRow | null>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DrizzleProductRepository implements ProductReadRepository {
  private readonly db: Db;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async listProducts(
    filter: ListProductsFilter,
  ): Promise<{ items: ProductRow[]; total: number }> {
    const page = filter.page ?? 1;
    const limit = Math.min(filter.limit ?? 50, 50);
    const offset = (page - 1) * limit;

    const conditions = buildProductConditions(filter);

    const rows = await this.db
      .select()
      .from(productsRm)
      .where(conditions)
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(productsRm)
      .where(conditions);

    const total = countResult[0]?.count ?? 0;

    return { items: rows.map(toProductRow), total };
  }

  async getProductById(id: string): Promise<ProductRow | null> {
    const rows = await this.db
      .select()
      .from(productsRm)
      .where(eq(productsRm.id, id));

    const row = rows[0];
    return row ? toProductRow(row) : null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildProductConditions(filter: ListProductsFilter) {
  const clauses = [eq(productsRm.status, "PUBLISHED")];

  if (filter.categoryId !== undefined) {
    clauses.push(eq(productsRm.categoryId, filter.categoryId));
  }
  if (filter.minPrice !== undefined) {
    clauses.push(gte(productsRm.price, filter.minPrice));
  }
  if (filter.maxPrice !== undefined) {
    clauses.push(lte(productsRm.price, filter.maxPrice));
  }
  if (filter.keyword !== undefined) {
    const kw = `%${filter.keyword}%`;
    clauses.push(
      or(like(productsRm.name, kw), like(productsRm.description, kw))!,
    );
  }

  return and(...clauses);
}

function toProductRow(row: typeof productsRm.$inferSelect): ProductRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    categoryId: row.categoryId,
    stock: row.stock,
    stockStatus: row.stockStatus,
    status: row.status,
    imageUrls: JSON.parse(row.imageUrls) as string[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
