import { drizzle } from "drizzle-orm/d1";
import { and, eq, ne, sql } from "drizzle-orm";
import { categoriesRm, productsRm } from "../../../db/schema";
import type { CategoryRepository } from "../../application/product/commands/CategoryCommandHandlers";

type Db = ReturnType<typeof drizzle>;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CategoryRow = {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
};

export interface CategoryReadRepository {
  listCategories(): Promise<CategoryRow[]>;
  existsByName(name: string): Promise<boolean>;
  existsById(categoryId: string): Promise<boolean>;
  hasProducts(categoryId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DrizzleCategoryRepository
  implements CategoryReadRepository, CategoryRepository {
  private readonly db: Db;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async listCategories(): Promise<CategoryRow[]> {
    const rows = await this.db.select().from(categoriesRm);
    return rows.map(toCategoryRow);
  }

  async existsByName(name: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: categoriesRm.id })
      .from(categoriesRm)
      .where(eq(categoriesRm.name, name));

    return rows.length > 0;
  }

  async existsById(categoryId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: categoriesRm.id })
      .from(categoriesRm)
      .where(eq(categoriesRm.id, categoryId));

    return rows.length > 0;
  }

  async hasProducts(categoryId: string): Promise<boolean> {
    // Exclude logically-deleted products (UNPUBLISHED status only used for deletion)
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(productsRm)
      .where(
        and(
          eq(productsRm.categoryId, categoryId),
          ne(productsRm.status, "UNPUBLISHED"),
        ),
      );

    return (result[0]?.count ?? 0) > 0;
  }

  async create(id: string, name: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.insert(categoriesRm).values({ id, name, createdAt: now });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(categoriesRm).where(eq(categoriesRm.id, id));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toCategoryRow(row: typeof categoriesRm.$inferSelect): CategoryRow {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
  };
}
