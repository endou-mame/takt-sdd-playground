import type {
  UserRepository,
  CustomerSummary,
  CustomerDetail,
} from "../../../infrastructure/repository/DrizzleUserRepository";
import type {
  AddressRepository,
  AddressRecord,
} from "../../../infrastructure/repository/DrizzleAddressRepository";
import type {
  WishlistRepository,
  WishlistItem,
} from "../../../infrastructure/repository/DrizzleWishlistRepository";

// ---------------------------------------------------------------------------
// Ports — re-exported for use by Presentation layer
// ---------------------------------------------------------------------------

export type { UserRepository, AddressRepository, WishlistRepository };

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

type UserQueryContext = {
  readonly userRepository: UserRepository;
  readonly addressRepository: AddressRepository;
  readonly wishlistRepository: WishlistRepository;
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleGetMyWishlist(
  userId: string,
  ctx: UserQueryContext,
): Promise<WishlistItem[]> {
  return ctx.wishlistRepository.listByUser(userId);
}

export async function handleGetMyAddresses(
  userId: string,
  ctx: UserQueryContext,
): Promise<AddressRecord[]> {
  return ctx.addressRepository.listByUser(userId);
}

export async function handleSearchCustomers(
  keyword: string,
  ctx: UserQueryContext,
): Promise<CustomerSummary[]> {
  return ctx.userRepository.searchCustomers(keyword);
}

export async function handleGetCustomerDetail(
  userId: string,
  ctx: UserQueryContext,
): Promise<CustomerDetail> {
  const detail = await ctx.userRepository.getCustomerDetail(userId);
  if (!detail) {
    throw { code: "CUSTOMER_NOT_FOUND" as const };
  }
  return detail;
}
