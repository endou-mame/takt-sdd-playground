import { drizzle } from "drizzle-orm/d1";
import { and, desc, eq } from "drizzle-orm";
import { wishlists } from "../../../db/schema";

type Db = ReturnType<typeof drizzle>;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type WishlistItem = {
  readonly id: string;
  readonly userId: string;
  readonly productId: string;
  readonly createdAt: string;
};

export interface WishlistRepository {
  listByUser(userId: string): Promise<WishlistItem[]>;
  add(userId: string, productId: string, id: string, createdAt: string): Promise<void>;
  remove(userId: string, productId: string): Promise<void>;
  exists(userId: string, productId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DrizzleWishlistRepository implements WishlistRepository {
  private readonly db: Db;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async listByUser(userId: string): Promise<WishlistItem[]> {
    const rows = await this.db
      .select()
      .from(wishlists)
      .where(eq(wishlists.userId, userId))
      .orderBy(desc(wishlists.createdAt));

    return rows.map(toWishlistItem);
  }

  async add(
    userId: string,
    productId: string,
    id: string,
    createdAt: string,
  ): Promise<void> {
    try {
      await this.db.insert(wishlists).values({ id, userId, productId, createdAt });
    } catch (err) {
      if (err instanceof Error) {
        const isUniqueViolation =
          err.message.includes("UNIQUE constraint failed") ||
          (err.cause instanceof Error &&
            err.cause.message.includes("UNIQUE constraint failed"));
        if (isUniqueViolation) {
          throw { code: "WISHLIST_DUPLICATE" as const };
        }
      }
      throw err;
    }
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.db
      .delete(wishlists)
      .where(
        and(eq(wishlists.userId, userId), eq(wishlists.productId, productId)),
      );
  }

  async exists(userId: string, productId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: wishlists.id })
      .from(wishlists)
      .where(
        and(eq(wishlists.userId, userId), eq(wishlists.productId, productId)),
      );

    return rows.length > 0;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toWishlistItem(row: typeof wishlists.$inferSelect): WishlistItem {
  return {
    id: row.id,
    userId: row.userId,
    productId: row.productId,
    createdAt: row.createdAt,
  };
}
