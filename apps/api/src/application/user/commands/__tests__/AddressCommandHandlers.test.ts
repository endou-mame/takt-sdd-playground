import { describe, it, expect, vi } from "vitest";
import {
  handleCreateAddress,
  handleUpdateAddress,
  handleDeleteAddress,
  type AddressContext,
  type CreateAddressCommand,
  type UpdateAddressCommand,
  type DeleteAddressCommand,
} from "../AddressCommandHandlers";
import type {
  AddressRepository,
  AddressRecord,
} from "../../../../infrastructure/repository/DrizzleAddressRepository";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
const VALID_ADDRESS_ID = "00000000-0000-4000-8000-000000000010";

const SAMPLE_ADDRESS: AddressRecord = {
  id: VALID_ADDRESS_ID,
  userId: VALID_USER_ID,
  postalCode: "100-0001",
  prefecture: "東京都",
  city: "千代田区",
  street: "1-1-1",
  name: "テスト太郎",
  phone: "090-0000-0000",
  createdAt: "2024-01-01T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

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

function makeContext(overrides: Partial<AddressContext> = {}): AddressContext {
  return {
    addressRepository: makeAddressRepository(),
    ...overrides,
  };
}

const VALID_CREATE_CMD: CreateAddressCommand = {
  userId: VALID_USER_ID,
  postalCode: "100-0001",
  prefecture: "東京都",
  city: "千代田区",
  street: "1-1-1",
  name: "テスト太郎",
  phone: "090-0000-0000",
};

// ---------------------------------------------------------------------------
// handleCreateAddress
// ---------------------------------------------------------------------------

describe("handleCreateAddress", () => {
  it("throws INVALID_ADDRESS_FIELDS when postalCode is empty", async () => {
    const ctx = makeContext();
    await expect(
      handleCreateAddress({ ...VALID_CREATE_CMD, postalCode: "" }, ctx),
    ).rejects.toMatchObject({ code: "INVALID_ADDRESS_FIELDS" });
  });

  it("throws INVALID_ADDRESS_FIELDS when prefecture is empty", async () => {
    const ctx = makeContext();
    await expect(
      handleCreateAddress({ ...VALID_CREATE_CMD, prefecture: "" }, ctx),
    ).rejects.toMatchObject({ code: "INVALID_ADDRESS_FIELDS" });
  });

  it("throws INVALID_ADDRESS_FIELDS when city is empty", async () => {
    const ctx = makeContext();
    await expect(
      handleCreateAddress({ ...VALID_CREATE_CMD, city: "" }, ctx),
    ).rejects.toMatchObject({ code: "INVALID_ADDRESS_FIELDS" });
  });

  it("throws INVALID_ADDRESS_FIELDS when street is empty", async () => {
    const ctx = makeContext();
    await expect(
      handleCreateAddress({ ...VALID_CREATE_CMD, street: "" }, ctx),
    ).rejects.toMatchObject({ code: "INVALID_ADDRESS_FIELDS" });
  });

  it("throws INVALID_ADDRESS_FIELDS when name is empty", async () => {
    const ctx = makeContext();
    await expect(
      handleCreateAddress({ ...VALID_CREATE_CMD, name: "" }, ctx),
    ).rejects.toMatchObject({ code: "INVALID_ADDRESS_FIELDS" });
  });

  it("throws INVALID_ADDRESS_FIELDS when phone is empty", async () => {
    const ctx = makeContext();
    await expect(
      handleCreateAddress({ ...VALID_CREATE_CMD, phone: "" }, ctx),
    ).rejects.toMatchObject({ code: "INVALID_ADDRESS_FIELDS" });
  });

  it("throws ADDRESS_BOOK_LIMIT_EXCEEDED when user already has 10 addresses", async () => {
    const ctx = makeContext({
      addressRepository: makeAddressRepository({
        countByUser: vi.fn().mockResolvedValue(10),
      }),
    });
    await expect(
      handleCreateAddress(VALID_CREATE_CMD, ctx),
    ).rejects.toMatchObject({ code: "ADDRESS_BOOK_LIMIT_EXCEEDED" });
  });

  it("creates address and returns addressId on success", async () => {
    const addressRepository = makeAddressRepository();
    const ctx = makeContext({ addressRepository });

    const result = await handleCreateAddress(VALID_CREATE_CMD, ctx);

    expect(result.addressId).toBeTypeOf("string");
    expect(addressRepository.create).toHaveBeenCalledOnce();
    const createArg = (addressRepository.create as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0]!;
    expect(createArg.userId).toBe(VALID_USER_ID);
    expect(createArg.postalCode).toBe("100-0001");
    expect(createArg.id).toBe(result.addressId);
  });

  it("allows creation when user has exactly 9 addresses", async () => {
    const ctx = makeContext({
      addressRepository: makeAddressRepository({
        countByUser: vi.fn().mockResolvedValue(9),
      }),
    });
    const result = await handleCreateAddress(VALID_CREATE_CMD, ctx);
    expect(result.addressId).toBeTypeOf("string");
  });
});

// ---------------------------------------------------------------------------
// handleUpdateAddress
// ---------------------------------------------------------------------------

describe("handleUpdateAddress", () => {
  const baseCmd: UpdateAddressCommand = {
    addressId: VALID_ADDRESS_ID,
    requesterId: VALID_USER_ID,
    city: "新宿区",
  };

  it("throws ADDRESS_NOT_FOUND when address does not exist", async () => {
    const ctx = makeContext();
    await expect(
      handleUpdateAddress(baseCmd, ctx),
    ).rejects.toMatchObject({ code: "ADDRESS_NOT_FOUND" });
  });

  it("throws FORBIDDEN when requester is not the owner", async () => {
    const ctx = makeContext({
      addressRepository: makeAddressRepository({
        findById: vi.fn().mockResolvedValue(SAMPLE_ADDRESS),
      }),
    });
    await expect(
      handleUpdateAddress({ ...baseCmd, requesterId: OTHER_USER_ID }, ctx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("calls update with correct addressId and requesterId on success", async () => {
    const addressRepository = makeAddressRepository({
      findById: vi.fn().mockResolvedValue(SAMPLE_ADDRESS),
    });
    const ctx = makeContext({ addressRepository });

    await handleUpdateAddress(baseCmd, ctx);

    expect(addressRepository.update).toHaveBeenCalledWith(
      VALID_ADDRESS_ID,
      VALID_USER_ID,
      expect.objectContaining({ city: "新宿区" }),
    );
  });

  it("passes only provided fields to repository update", async () => {
    const addressRepository = makeAddressRepository({
      findById: vi.fn().mockResolvedValue(SAMPLE_ADDRESS),
    });
    const ctx = makeContext({ addressRepository });

    await handleUpdateAddress(
      { addressId: VALID_ADDRESS_ID, requesterId: VALID_USER_ID, phone: "080-1111-2222" },
      ctx,
    );

    const updateArg = (addressRepository.update as ReturnType<typeof vi.fn>)
      .mock.calls[0]![2]!;
    expect(updateArg).toEqual({ phone: "080-1111-2222" });
    expect(updateArg.city).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handleDeleteAddress
// ---------------------------------------------------------------------------

describe("handleDeleteAddress", () => {
  const baseCmd: DeleteAddressCommand = {
    addressId: VALID_ADDRESS_ID,
    requesterId: VALID_USER_ID,
  };

  it("throws ADDRESS_NOT_FOUND when address does not exist", async () => {
    const ctx = makeContext();
    await expect(
      handleDeleteAddress(baseCmd, ctx),
    ).rejects.toMatchObject({ code: "ADDRESS_NOT_FOUND" });
  });

  it("throws FORBIDDEN when requester is not the owner", async () => {
    const ctx = makeContext({
      addressRepository: makeAddressRepository({
        findById: vi.fn().mockResolvedValue(SAMPLE_ADDRESS),
      }),
    });
    await expect(
      handleDeleteAddress({ ...baseCmd, requesterId: OTHER_USER_ID }, ctx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("calls delete with correct addressId and requesterId on success", async () => {
    const addressRepository = makeAddressRepository({
      findById: vi.fn().mockResolvedValue(SAMPLE_ADDRESS),
    });
    const ctx = makeContext({ addressRepository });

    await handleDeleteAddress(baseCmd, ctx);

    expect(addressRepository.delete).toHaveBeenCalledWith(
      VALID_ADDRESS_ID,
      VALID_USER_ID,
    );
  });
});
