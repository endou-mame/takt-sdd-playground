import type { WishlistRepository } from "../../../infrastructure/repository/DrizzleWishlistRepository";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type WishlistContext = {
  readonly wishlistRepository: WishlistRepository;
};

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

export type AddToWishlistCommand = {
  readonly userId: string;
  readonly productId: string;
};

export type RemoveFromWishlistCommand = {
  readonly userId: string;
  readonly productId: string;
};

// ---------------------------------------------------------------------------
// handleAddToWishlist
// ---------------------------------------------------------------------------

export async function handleAddToWishlist(
  cmd: AddToWishlistCommand,
  ctx: WishlistContext,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // WISHLIST_DUPLICATE is thrown by the repository on unique constraint violation
  await ctx.wishlistRepository.add(cmd.userId, cmd.productId, id, now);
}

// ---------------------------------------------------------------------------
// handleRemoveFromWishlist
// ---------------------------------------------------------------------------

export async function handleRemoveFromWishlist(
  cmd: RemoveFromWishlistCommand,
  ctx: WishlistContext,
): Promise<void> {
  await ctx.wishlistRepository.remove(cmd.userId, cmd.productId);
}
