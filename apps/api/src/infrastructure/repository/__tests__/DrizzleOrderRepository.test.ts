import { describe, it, expect, beforeEach } from "vitest";
import { DrizzleOrderRepository } from "../DrizzleOrderRepository";
import { createD1MockHandle, type D1MockHandle } from "./d1MockFactory";

// ordersRm column order from schema.ts:
// id, customerId, status, items, shippingAddress, paymentMethod,
// subtotal, shippingFee, total, paymentCode, paymentExpiresAt, createdAt, updatedAt
function orderRow(overrides: Partial<{
  id: string; customerId: string; status: string; items: string;
  shippingAddress: string; paymentMethod: string; subtotal: number;
  shippingFee: number; total: number; paymentCode: string | null;
  paymentExpiresAt: string | null; createdAt: string; updatedAt: string;
}> = {}): unknown[] {
  const defaultItems = JSON.stringify([
    { productId: "prod-1", name: "Widget", price: 1000, quantity: 2 },
  ]);
  const defaultAddress = JSON.stringify({
    postalCode: "100-0001",
    prefecture: "東京都",
    city: "千代田区",
    street: "1-1",
    name: "山田太郎",
    phone: "03-1234-5678",
  });

  return [
    overrides.id ?? "order-1",
    overrides.customerId ?? "user-1",
    overrides.status ?? "ACCEPTED",
    overrides.items ?? defaultItems,
    overrides.shippingAddress ?? defaultAddress,
    overrides.paymentMethod ?? "CREDIT_CARD",
    overrides.subtotal ?? 2000,
    overrides.shippingFee ?? 500,
    overrides.total ?? 2500,
    overrides.paymentCode ?? null,
    overrides.paymentExpiresAt ?? null,
    overrides.createdAt ?? "2024-01-01T00:00:00.000Z",
    overrides.updatedAt ?? "2024-01-01T00:00:00.000Z",
  ];
}

describe("DrizzleOrderRepository", () => {
  let handle: D1MockHandle;
  let repo: DrizzleOrderRepository;

  beforeEach(() => {
    handle = createD1MockHandle();
    repo = new DrizzleOrderRepository(handle.d1);
  });

  describe("getOrderById()", () => {
    it("returns null when order does not exist", async () => {
      handle.setConfig({ rawRows: [] });
      const result = await repo.getOrderById("nonexistent");
      expect(result).toBeNull();
    });

    it("parses items JSON array", async () => {
      const items = [{ productId: "p-1", name: "Widget", price: 1000, quantity: 2 }];
      handle.setConfig({
        rawRows: [orderRow({ id: "ord-1", items: JSON.stringify(items) })],
      });

      const result = await repo.getOrderById("ord-1");
      expect(result?.items).toEqual(items);
    });

    it("parses shippingAddress JSON object", async () => {
      const addr = {
        postalCode: "100-0001", prefecture: "東京都", city: "千代田区",
        street: "1-1", name: "山田太郎", phone: "03-1234-5678",
      };
      handle.setConfig({
        rawRows: [orderRow({ shippingAddress: JSON.stringify(addr) })],
      });

      const result = await repo.getOrderById("ord-1");
      expect(result?.shippingAddress).toEqual(addr);
    });

    it("maps nullable paymentCode and paymentExpiresAt", async () => {
      handle.setConfig({
        rawRows: [orderRow({ paymentCode: "CODE123", paymentExpiresAt: "2024-01-04T00:00:00.000Z" })],
      });

      const result = await repo.getOrderById("ord-1");
      expect(result?.paymentCode).toBe("CODE123");
      expect(result?.paymentExpiresAt).toBe("2024-01-04T00:00:00.000Z");
    });

    it("returns null for paymentCode when it is absent", async () => {
      handle.setConfig({ rawRows: [orderRow({ paymentCode: null })] });
      const result = await repo.getOrderById("ord-1");
      expect(result?.paymentCode).toBeNull();
    });
  });

  describe("listOrdersByCustomer()", () => {
    it("returns empty array when customer has no orders", async () => {
      handle.setConfig({ rawRows: [] });
      const result = await repo.listOrdersByCustomer("user-99");
      expect(result).toEqual([]);
    });

    it("maps all orders to OrderRow", async () => {
      handle.setConfig({
        rawRows: [
          orderRow({ id: "ord-1", customerId: "user-1" }),
          orderRow({ id: "ord-2", customerId: "user-1" }),
        ],
      });

      const result = await repo.listOrdersByCustomer("user-1");
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe("ord-1");
      expect(result[1]?.id).toBe("ord-2");
    });
  });

  describe("verifyOwnership()", () => {
    it("returns false when no matching row", async () => {
      handle.setConfig({ rawRows: [] });
      const result = await repo.verifyOwnership("ord-1", "user-1");
      expect(result).toBe(false);
    });

    it("returns true when a matching row exists", async () => {
      handle.setConfig({ rawRows: [["ord-1"]] });
      const result = await repo.verifyOwnership("ord-1", "user-1");
      expect(result).toBe(true);
    });
  });

  describe("listAllOrders()", () => {
    it("returns items and total", async () => {
      handle.setConfig({
        rawRows: [orderRow({ id: "ord-1" })],
        countValue: 1,
      });

      const { items, total } = await repo.listAllOrders({});
      expect(items).toHaveLength(1);
      expect(total).toBe(1);
    });

    it("returns empty result when no orders match filter", async () => {
      handle.setConfig({ rawRows: [], countValue: 0 });
      const { items, total } = await repo.listAllOrders({ status: "SHIPPED" });
      expect(items).toHaveLength(0);
      expect(total).toBe(0);
    });
  });
});
