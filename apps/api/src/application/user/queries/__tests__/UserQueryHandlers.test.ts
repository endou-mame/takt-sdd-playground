import { describe, it, expect, vi } from "vitest";
import {
  handleGetMyWishlist,
  handleGetMyAddresses,
  handleSearchCustomers,
  handleGetCustomerDetail,
} from "../UserQueryHandlers";
import type { UserRepository, CustomerSummary, CustomerDetail } from "../../../../infrastructure/repository/DrizzleUserRepository";
import type { AddressRepository, AddressRecord } from "../../../../infrastructure/repository/DrizzleAddressRepository";
import type { WishlistRepository, WishlistItem } from "../../../../infrastructure/repository/DrizzleWishlistRepository";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";

const SAMPLE_ADDRESS: AddressRecord = {
  id: "00000000-0000-4000-8000-000000000010",
  userId: VALID_USER_ID,
  postalCode: "100-0001",
  prefecture: "東京都",
  city: "千代田区",
  street: "1-1-1",
  name: "テスト太郎",
  phone: "090-0000-0000",
  createdAt: "2024-01-01T00:00:00.000Z",
};

const SAMPLE_WISHLIST_ITEM: WishlistItem = {
  id: "00000000-0000-4000-8000-000000000020",
  userId: VALID_USER_ID,
  productId: "00000000-0000-4000-8000-000000000030",
  createdAt: "2024-01-01T00:00:00.000Z",
};

const SAMPLE_CUSTOMER_SUMMARY: CustomerSummary = {
  id: VALID_USER_ID,
  email: "user@example.com",
  name: "テスト太郎",
  role: "CUSTOMER",
  createdAt: "2024-01-01T00:00:00.000Z",
};

const SAMPLE_CUSTOMER_DETAIL: CustomerDetail = {
  user: {
    id: VALID_USER_ID,
    email: "user@example.com",
    passwordHash: "hashed",
    name: "テスト太郎",
    role: "CUSTOMER",
    emailVerified: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  addresses: [SAMPLE_ADDRESS],
  recentOrders: [],
};

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeUserRepository(
  overrides: Partial<UserRepository> = {},
): UserRepository {
  return {
    findByEmail: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    searchCustomers: vi.fn().mockResolvedValue([]),
    getCustomerDetail: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeAddressRepository(
  overrides: Partial<AddressRepository> = {},
): AddressRepository {
  return {
    listByUser: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    countByUser: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

function makeWishlistRepository(
  overrides: Partial<WishlistRepository> = {},
): WishlistRepository {
  return {
    listByUser: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

function makeContext(overrides: {
  userRepository?: UserRepository;
  addressRepository?: AddressRepository;
  wishlistRepository?: WishlistRepository;
} = {}) {
  return {
    userRepository: makeUserRepository(),
    addressRepository: makeAddressRepository(),
    wishlistRepository: makeWishlistRepository(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// handleGetMyWishlist
// ---------------------------------------------------------------------------

describe("handleGetMyWishlist", () => {
  it("delegates to wishlistRepository.listByUser", async () => {
    const wishlistRepository = makeWishlistRepository({
      listByUser: vi.fn().mockResolvedValue([SAMPLE_WISHLIST_ITEM]),
    });
    const ctx = makeContext({ wishlistRepository });

    const result = await handleGetMyWishlist(VALID_USER_ID, ctx);

    expect(wishlistRepository.listByUser).toHaveBeenCalledWith(VALID_USER_ID);
    expect(result).toHaveLength(1);
    expect(result[0]!.productId).toBe(SAMPLE_WISHLIST_ITEM.productId);
  });

  it("returns empty array when wishlist is empty", async () => {
    const ctx = makeContext();
    const result = await handleGetMyWishlist(VALID_USER_ID, ctx);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// handleGetMyAddresses
// ---------------------------------------------------------------------------

describe("handleGetMyAddresses", () => {
  it("delegates to addressRepository.listByUser", async () => {
    const addressRepository = makeAddressRepository({
      listByUser: vi.fn().mockResolvedValue([SAMPLE_ADDRESS]),
    });
    const ctx = makeContext({ addressRepository });

    const result = await handleGetMyAddresses(VALID_USER_ID, ctx);

    expect(addressRepository.listByUser).toHaveBeenCalledWith(VALID_USER_ID);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(SAMPLE_ADDRESS.id);
  });

  it("returns empty array when user has no addresses", async () => {
    const ctx = makeContext();
    const result = await handleGetMyAddresses(VALID_USER_ID, ctx);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// handleSearchCustomers
// ---------------------------------------------------------------------------

describe("handleSearchCustomers", () => {
  it("delegates to userRepository.searchCustomers with keyword", async () => {
    const userRepository = makeUserRepository({
      searchCustomers: vi.fn().mockResolvedValue([SAMPLE_CUSTOMER_SUMMARY]),
    });
    const ctx = makeContext({ userRepository });

    const result = await handleSearchCustomers("テスト", ctx);

    expect(userRepository.searchCustomers).toHaveBeenCalledWith("テスト");
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("テスト太郎");
  });

  it("returns empty array when no customers match", async () => {
    const ctx = makeContext();
    const result = await handleSearchCustomers("nonexistent", ctx);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// handleGetCustomerDetail
// ---------------------------------------------------------------------------

describe("handleGetCustomerDetail", () => {
  it("returns customer detail when found", async () => {
    const userRepository = makeUserRepository({
      getCustomerDetail: vi.fn().mockResolvedValue(SAMPLE_CUSTOMER_DETAIL),
    });
    const ctx = makeContext({ userRepository });

    const result = await handleGetCustomerDetail(VALID_USER_ID, ctx);

    expect(userRepository.getCustomerDetail).toHaveBeenCalledWith(VALID_USER_ID);
    expect(result.user.id).toBe(VALID_USER_ID);
    expect(result.addresses).toHaveLength(1);
  });

  it("throws CUSTOMER_NOT_FOUND when user does not exist", async () => {
    const ctx = makeContext();

    await expect(
      handleGetCustomerDetail(VALID_USER_ID, ctx),
    ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
  });
});
