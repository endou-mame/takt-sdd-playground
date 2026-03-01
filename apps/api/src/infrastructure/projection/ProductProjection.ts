import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { productsRm } from "../../../db/schema";
import type { ProductEvent } from "../../domain/product/ProductEvents";

type Db = ReturnType<typeof drizzle>;

export class ProductProjection {
  private readonly db: Db;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async apply(event: ProductEvent): Promise<void> {
    const now = new Date().toISOString();

    switch (event.type) {
      case "ProductCreated": {
        const stockStatus = event.stock > 0 ? "IN_STOCK" : "OUT_OF_STOCK";
        await this.db.insert(productsRm).values({
          id: event.productId,
          name: event.name,
          description: event.description,
          price: event.price,
          categoryId: event.categoryId,
          stock: event.stock,
          stockStatus,
          status: "PUBLISHED",
          imageUrls: "[]",
          createdAt: now,
          updatedAt: now,
        });
        break;
      }

      case "ProductUpdated": {
        await this.db
          .update(productsRm)
          .set({
            ...(event.changes.name !== undefined ? { name: event.changes.name } : {}),
            ...(event.changes.description !== undefined
              ? { description: event.changes.description }
              : {}),
            ...(event.changes.price !== undefined ? { price: event.changes.price } : {}),
            ...(event.changes.categoryId !== undefined
              ? { categoryId: event.changes.categoryId }
              : {}),
            updatedAt: now,
          })
          .where(eq(productsRm.id, event.productId));
        break;
      }

      case "ProductDeleted": {
        await this.db
          .update(productsRm)
          .set({ status: "UNPUBLISHED", updatedAt: now })
          .where(eq(productsRm.id, event.productId));
        break;
      }

      case "StockUpdated": {
        const newStock = event.quantity;
        const stockStatus = newStock > 0 ? "IN_STOCK" : "OUT_OF_STOCK";
        await this.db
          .update(productsRm)
          .set({ stock: newStock, stockStatus, updatedAt: now })
          .where(eq(productsRm.id, event.productId));
        break;
      }

      case "StockDecreased": {
        const rows = await this.db
          .select({ stock: productsRm.stock })
          .from(productsRm)
          .where(eq(productsRm.id, event.productId));
        const current = rows[0];
        if (!current) break;
        const newStock = Math.max(0, current.stock - event.quantity);
        const stockStatus = newStock > 0 ? "IN_STOCK" : "OUT_OF_STOCK";
        await this.db
          .update(productsRm)
          .set({ stock: newStock, stockStatus, updatedAt: now })
          .where(eq(productsRm.id, event.productId));
        break;
      }

      case "StockIncreased": {
        const rows = await this.db
          .select({ stock: productsRm.stock })
          .from(productsRm)
          .where(eq(productsRm.id, event.productId));
        const current = rows[0];
        if (!current) break;
        const newStock = current.stock + event.quantity;
        const stockStatus = newStock > 0 ? "IN_STOCK" : "OUT_OF_STOCK";
        await this.db
          .update(productsRm)
          .set({ stock: newStock, stockStatus, updatedAt: now })
          .where(eq(productsRm.id, event.productId));
        break;
      }

      case "ProductImageAssociated": {
        const rows = await this.db
          .select({ imageUrls: productsRm.imageUrls })
          .from(productsRm)
          .where(eq(productsRm.id, event.productId));
        const current = rows[0];
        if (!current) break;
        const updatedImageUrls = [...(JSON.parse(current.imageUrls) as string[]), event.imageUrl];
        await this.db
          .update(productsRm)
          .set({ imageUrls: JSON.stringify(updatedImageUrls), updatedAt: now })
          .where(eq(productsRm.id, event.productId));
        break;
      }
    }
  }
}
