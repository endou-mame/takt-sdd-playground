import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleListMyOrders,
  handleGetOrderDetail,
  handleListAllOrders,
  type AdminOrderFilter,
} from "../OrderQueryHandlers";
import type { OrderReadRepository, OrderRow } from "../../../../infrastructure/repository/DrizzleOrderRepository";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ORDER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_CUSTOMER_ID = "00000000-0000-4000-8000-000000000002";
const OTHER_CUSTOMER_ID = "00000000-0000-4000-8000-000000000099";

const SAMPLE_ORDER: OrderRow = {
  id: VALID_ORDER_ID,
  customerId: VALID_CUSTOMER_ID,
  status: "ACCEPTED",
  items: [{ productId: "prod-1", name: "Widget", price: 1000, quantity: 2 }],
  shippingAddress: {
    postalCode: "100-0001",
    prefecture: "東京都",
    city: "千代田区",
    street: "1-1-1",
    name: "テスト太郎",
    phone: "090-0000-0000",
  },
  paymentMethod: "CASH_ON_DELIVERY",
  subtotal: 2000,
  shippingFee: 300,
  total: 2300,
  paymentCode: null,
  paymentExpiresAt: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

function makeOrderRepository(rows: OrderRow[] = [SAMPLE_ORDER]): OrderReadRepository {
  return {
    listOrdersByCustomer: vi.fn().mockResolvedValue(rows),
    getOrderById: vi.fn().mockResolvedValue(rows[0] ?? null),
    verifyOwnership: vi.fn().mockResolvedValue(true),
    listAllOrders: vi.fn().mockResolvedValue({ items: rows, total: rows.length }),
  };
}

// ---------------------------------------------------------------------------
// handleListMyOrders
// ---------------------------------------------------------------------------

describe("handleListMyOrders", () => {
  it("delegates to orderRepository.listOrdersByCustomer", async () => {
    const orderRepository = makeOrderRepository([SAMPLE_ORDER]);
    const result = await handleListMyOrders(VALID_CUSTOMER_ID, { orderRepository });

    expect(orderRepository.listOrdersByCustomer).toHaveBeenCalledWith(VALID_CUSTOMER_ID);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(VALID_ORDER_ID);
  });

  it("returns empty array when customer has no orders", async () => {
    const orderRepository = makeOrderRepository([]);
    const result = await handleListMyOrders(VALID_CUSTOMER_ID, { orderRepository });

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// handleGetOrderDetail
// ---------------------------------------------------------------------------

describe("handleGetOrderDetail", () => {
  it("returns the order for the owner", async () => {
    const orderRepository = makeOrderRepository([SAMPLE_ORDER]);
    const result = await handleGetOrderDetail(VALID_ORDER_ID, VALID_CUSTOMER_ID, false, { orderRepository });

    expect(result).toEqual(SAMPLE_ORDER);
    expect(orderRepository.verifyOwnership).toHaveBeenCalledWith(VALID_ORDER_ID, VALID_CUSTOMER_ID);
  });

  it("returns the order for an admin without ownership check", async () => {
    const orderRepository = makeOrderRepository([SAMPLE_ORDER]);
    const result = await handleGetOrderDetail(VALID_ORDER_ID, OTHER_CUSTOMER_ID, true, { orderRepository });

    expect(result).toEqual(SAMPLE_ORDER);
    expect(orderRepository.verifyOwnership).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when non-owner requests order", async () => {
    const orderRepository = makeOrderRepository([SAMPLE_ORDER]);
    (orderRepository.verifyOwnership as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(
      handleGetOrderDetail(VALID_ORDER_ID, OTHER_CUSTOMER_ID, false, { orderRepository }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws ORDER_NOT_FOUND when order does not exist", async () => {
    const emptyRepo = makeOrderRepository([]);
    (emptyRepo.getOrderById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      handleGetOrderDetail(VALID_ORDER_ID, VALID_CUSTOMER_ID, false, { orderRepository: emptyRepo }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });
});

// ---------------------------------------------------------------------------
// handleListAllOrders
// ---------------------------------------------------------------------------

describe("handleListAllOrders", () => {
  it("delegates to orderRepository.listAllOrders with filter", async () => {
    const orderRepository = makeOrderRepository([SAMPLE_ORDER]);
    const filter: AdminOrderFilter = { status: "ACCEPTED", page: 1, limit: 10 };
    const result = await handleListAllOrders(filter, { orderRepository });

    expect(orderRepository.listAllOrders).toHaveBeenCalledWith(filter);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("passes empty filter to repository", async () => {
    const orderRepository = makeOrderRepository([]);
    (orderRepository.listAllOrders as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });

    const result = await handleListAllOrders({}, { orderRepository });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
