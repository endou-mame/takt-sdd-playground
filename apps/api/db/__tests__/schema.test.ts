import { describe, it, expect } from "vitest";
import {
  domainEvents,
  productsRm,
  categoriesRm,
  ordersRm,
  users,
  addresses,
  wishlists,
  refreshTokens,
  passwordResetTokens,
  emailVerificationTokens,
  emailSendAttempts,
} from "../schema";

describe("schema", () => {
  it("exports all required tables", () => {
    expect(domainEvents).toBeDefined();
    expect(productsRm).toBeDefined();
    expect(categoriesRm).toBeDefined();
    expect(ordersRm).toBeDefined();
    expect(users).toBeDefined();
    expect(addresses).toBeDefined();
    expect(wishlists).toBeDefined();
    expect(refreshTokens).toBeDefined();
    expect(passwordResetTokens).toBeDefined();
    expect(emailVerificationTokens).toBeDefined();
    expect(emailSendAttempts).toBeDefined();
  });

  it("domain_events table has correct name", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((domainEvents as any)[Symbol.for("drizzle:Name")]).toBe("domain_events");
  });

  it("products_rm table has correct name", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((productsRm as any)[Symbol.for("drizzle:Name")]).toBe("products_rm");
  });
});
