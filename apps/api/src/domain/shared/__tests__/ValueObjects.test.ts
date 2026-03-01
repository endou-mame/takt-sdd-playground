import { describe, it, expect } from "vitest";
import {
  parseProductId,
  safeParseProductId,
  parseOrderId,
  safeParseOrderId,
  parseUserId,
  safeParseUserId,
  parseCategoryId,
  safeParseCategoryId,
  parseEmail,
  safeParseEmail,
  parsePrice,
  safeParsePrice,
  parseStockCount,
  safeParseStockCount,
} from "../ValueObjects";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

// ---------------------------------------------------------------------------
// UUID-based IDs (ProductId, OrderId, UserId, CategoryId)
// ---------------------------------------------------------------------------

describe("ProductId", () => {
  it("accepts a valid UUID", () => {
    expect(parseProductId(VALID_UUID)).toBe(VALID_UUID);
  });

  it("throws for a non-UUID string", () => {
    expect(() => parseProductId("not-a-uuid")).toThrow();
  });

  it("throws for null", () => {
    expect(() => parseProductId(null)).toThrow();
  });

  it("throws for a number", () => {
    expect(() => parseProductId(123)).toThrow();
  });

  it("safeParseProductId returns parsed value for a valid UUID", () => {
    expect(safeParseProductId(VALID_UUID)).toBe(VALID_UUID);
  });

  it("safeParseProductId returns null for an invalid value", () => {
    expect(safeParseProductId("invalid")).toBeNull();
  });
});

describe("OrderId", () => {
  it("accepts a valid UUID", () => {
    expect(parseOrderId(VALID_UUID)).toBe(VALID_UUID);
  });

  it("throws for a non-UUID string", () => {
    expect(() => parseOrderId("not-a-uuid")).toThrow();
  });

  it("safeParseOrderId returns null for an invalid value", () => {
    expect(safeParseOrderId("invalid")).toBeNull();
  });
});

describe("UserId", () => {
  it("accepts a valid UUID", () => {
    expect(parseUserId(VALID_UUID)).toBe(VALID_UUID);
  });

  it("throws for an empty string", () => {
    expect(() => parseUserId("")).toThrow();
  });

  it("safeParseUserId returns null for an invalid value", () => {
    expect(safeParseUserId("not-uuid")).toBeNull();
  });
});

describe("CategoryId", () => {
  it("accepts a valid UUID", () => {
    expect(parseCategoryId(VALID_UUID)).toBe(VALID_UUID);
  });

  it("safeParseCategoeryId returns null for an invalid value", () => {
    expect(safeParseCategoryId("not-uuid")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

describe("Email", () => {
  it("accepts a simple valid email", () => {
    expect(parseEmail("test@example.com")).toBe("test@example.com");
  });

  it("accepts an email with plus-addressing", () => {
    expect(parseEmail("user+tag@domain.co.jp")).toBe("user+tag@domain.co.jp");
  });

  it("throws for a string without @", () => {
    expect(() => parseEmail("nodomain")).toThrow();
  });

  it("throws for a string with @ but no domain", () => {
    expect(() => parseEmail("user@")).toThrow();
  });

  it("throws for an empty string", () => {
    expect(() => parseEmail("")).toThrow();
  });

  it("throws for null", () => {
    expect(() => parseEmail(null)).toThrow();
  });

  it("safeParseEmail returns parsed value for a valid email", () => {
    expect(safeParseEmail("valid@example.com")).toBe("valid@example.com");
  });

  it("safeParseEmail returns null for an invalid value", () => {
    expect(safeParseEmail("not-an-email")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Price  (integer >= 0)
// ---------------------------------------------------------------------------

describe("Price", () => {
  it("accepts 0 (boundary: minimum valid price)", () => {
    expect(parsePrice(0)).toBe(0);
  });

  it("accepts a positive integer", () => {
    expect(parsePrice(1000)).toBe(1000);
  });

  it("throws for -1 (boundary: one below minimum)", () => {
    expect(() => parsePrice(-1)).toThrow();
  });

  it("throws for a non-integer (1.5)", () => {
    expect(() => parsePrice(1.5)).toThrow();
  });

  it("throws for a numeric string", () => {
    expect(() => parsePrice("100")).toThrow();
  });

  it("throws for null", () => {
    expect(() => parsePrice(null)).toThrow();
  });

  it("safeParsePrice returns parsed value for a valid price", () => {
    expect(safeParsePrice(500)).toBe(500);
  });

  it("safeParsePrice returns null for a negative value", () => {
    expect(safeParsePrice(-1)).toBeNull();
  });

  it("safeParsePrice returns null for a non-integer", () => {
    expect(safeParsePrice(1.5)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// StockCount  (integer >= 0)
// ---------------------------------------------------------------------------

describe("StockCount", () => {
  it("accepts 0 (boundary: minimum valid stock)", () => {
    expect(parseStockCount(0)).toBe(0);
  });

  it("accepts a positive integer", () => {
    expect(parseStockCount(100)).toBe(100);
  });

  it("throws for -1 (boundary: one below minimum)", () => {
    expect(() => parseStockCount(-1)).toThrow();
  });

  it("throws for a non-integer (0.5)", () => {
    expect(() => parseStockCount(0.5)).toThrow();
  });

  it("throws for a numeric string", () => {
    expect(() => parseStockCount("5")).toThrow();
  });

  it("safeParseStockCount returns parsed value for valid stock", () => {
    expect(safeParseStockCount(10)).toBe(10);
  });

  it("safeParseStockCount returns null for a negative value", () => {
    expect(safeParseStockCount(-1)).toBeNull();
  });
});
