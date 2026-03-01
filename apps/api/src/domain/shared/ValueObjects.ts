import { z } from "zod";

// Branded types prevent mixing up IDs of different aggregate types at compile
// time, even though they share the same runtime representation (string/number).
export type ProductId = string & { readonly _brand: "ProductId" };
export type OrderId = string & { readonly _brand: "OrderId" };
export type UserId = string & { readonly _brand: "UserId" };
export type CategoryId = string & { readonly _brand: "CategoryId" };
export type Email = string & { readonly _brand: "Email" };
export type Price = number & { readonly _brand: "Price" };
export type StockCount = number & { readonly _brand: "StockCount" };

const uuidSchema = z.string().uuid();
const emailSchema = z.string().email();
const priceSchema = z.number().int().nonnegative();
const stockCountSchema = z.number().int().nonnegative();

// ---------------------------------------------------------------------------
// ProductId
// ---------------------------------------------------------------------------

export function parseProductId(raw: unknown): ProductId {
  return uuidSchema.parse(raw) as ProductId;
}

export function safeParseProductId(raw: unknown): ProductId | null {
  const result = uuidSchema.safeParse(raw);
  return result.success ? (result.data as ProductId) : null;
}

// ---------------------------------------------------------------------------
// OrderId
// ---------------------------------------------------------------------------

export function parseOrderId(raw: unknown): OrderId {
  return uuidSchema.parse(raw) as OrderId;
}

export function safeParseOrderId(raw: unknown): OrderId | null {
  const result = uuidSchema.safeParse(raw);
  return result.success ? (result.data as OrderId) : null;
}

// ---------------------------------------------------------------------------
// UserId
// ---------------------------------------------------------------------------

export function parseUserId(raw: unknown): UserId {
  return uuidSchema.parse(raw) as UserId;
}

export function safeParseUserId(raw: unknown): UserId | null {
  const result = uuidSchema.safeParse(raw);
  return result.success ? (result.data as UserId) : null;
}

// ---------------------------------------------------------------------------
// CategoryId
// ---------------------------------------------------------------------------

export function parseCategoryId(raw: unknown): CategoryId {
  return uuidSchema.parse(raw) as CategoryId;
}

export function safeParseCategoryId(raw: unknown): CategoryId | null {
  const result = uuidSchema.safeParse(raw);
  return result.success ? (result.data as CategoryId) : null;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export function parseEmail(raw: unknown): Email {
  return emailSchema.parse(raw) as Email;
}

export function safeParseEmail(raw: unknown): Email | null {
  const result = emailSchema.safeParse(raw);
  return result.success ? (result.data as Email) : null;
}

// ---------------------------------------------------------------------------
// Price  (integer yen, >= 0)
// ---------------------------------------------------------------------------

export function parsePrice(raw: unknown): Price {
  return priceSchema.parse(raw) as Price;
}

export function safeParsePrice(raw: unknown): Price | null {
  const result = priceSchema.safeParse(raw);
  return result.success ? (result.data as Price) : null;
}

// ---------------------------------------------------------------------------
// StockCount  (integer, >= 0)
// ---------------------------------------------------------------------------

export function parseStockCount(raw: unknown): StockCount {
  return stockCountSchema.parse(raw) as StockCount;
}

export function safeParseStockCount(raw: unknown): StockCount | null {
  const result = stockCountSchema.safeParse(raw);
  return result.success ? (result.data as StockCount) : null;
}
