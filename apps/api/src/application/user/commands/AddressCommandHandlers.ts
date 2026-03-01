import type {
  AddressRepository,
  UpdateAddressInput,
} from "../../../infrastructure/repository/DrizzleAddressRepository";

const ADDRESS_LIMIT = 10;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type AddressContext = {
  readonly addressRepository: AddressRepository;
};

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

export type CreateAddressCommand = {
  readonly userId: string;
  readonly postalCode: string;
  readonly prefecture: string;
  readonly city: string;
  readonly street: string;
  readonly name: string;
  readonly phone: string;
};

export type UpdateAddressCommand = {
  readonly addressId: string;
  readonly requesterId: string;
  readonly postalCode?: string;
  readonly prefecture?: string;
  readonly city?: string;
  readonly street?: string;
  readonly name?: string;
  readonly phone?: string;
};

export type DeleteAddressCommand = {
  readonly addressId: string;
  readonly requesterId: string;
};

// ---------------------------------------------------------------------------
// handleCreateAddress
// ---------------------------------------------------------------------------

export async function handleCreateAddress(
  cmd: CreateAddressCommand,
  ctx: AddressContext,
): Promise<{ addressId: string }> {
  if (
    !cmd.postalCode ||
    !cmd.prefecture ||
    !cmd.city ||
    !cmd.street ||
    !cmd.name ||
    !cmd.phone
  ) {
    throw { code: "INVALID_ADDRESS_FIELDS" as const };
  }

  const count = await ctx.addressRepository.countByUser(cmd.userId);
  if (count >= ADDRESS_LIMIT) {
    throw { code: "ADDRESS_BOOK_LIMIT_EXCEEDED" as const };
  }

  const addressId = crypto.randomUUID();
  const now = new Date().toISOString();

  await ctx.addressRepository.create({
    id: addressId,
    userId: cmd.userId,
    postalCode: cmd.postalCode,
    prefecture: cmd.prefecture,
    city: cmd.city,
    street: cmd.street,
    name: cmd.name,
    phone: cmd.phone,
    createdAt: now,
  });

  return { addressId };
}

// ---------------------------------------------------------------------------
// handleUpdateAddress
// ---------------------------------------------------------------------------

export async function handleUpdateAddress(
  cmd: UpdateAddressCommand,
  ctx: AddressContext,
): Promise<void> {
  const address = await ctx.addressRepository.findById(cmd.addressId);
  if (!address) {
    throw { code: "ADDRESS_NOT_FOUND" as const };
  }

  if (address.userId !== cmd.requesterId) {
    throw { code: "FORBIDDEN" as const };
  }

  const updates: UpdateAddressInput = {
    ...(cmd.postalCode !== undefined ? { postalCode: cmd.postalCode } : {}),
    ...(cmd.prefecture !== undefined ? { prefecture: cmd.prefecture } : {}),
    ...(cmd.city !== undefined ? { city: cmd.city } : {}),
    ...(cmd.street !== undefined ? { street: cmd.street } : {}),
    ...(cmd.name !== undefined ? { name: cmd.name } : {}),
    ...(cmd.phone !== undefined ? { phone: cmd.phone } : {}),
  };

  await ctx.addressRepository.update(cmd.addressId, cmd.requesterId, updates);
}

// ---------------------------------------------------------------------------
// handleDeleteAddress
// ---------------------------------------------------------------------------

export async function handleDeleteAddress(
  cmd: DeleteAddressCommand,
  ctx: AddressContext,
): Promise<void> {
  const address = await ctx.addressRepository.findById(cmd.addressId);
  if (!address) {
    throw { code: "ADDRESS_NOT_FOUND" as const };
  }

  if (address.userId !== cmd.requesterId) {
    throw { code: "FORBIDDEN" as const };
  }

  await ctx.addressRepository.delete(cmd.addressId, cmd.requesterId);
}
