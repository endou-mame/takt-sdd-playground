import { describe, it, expect, vi } from "vitest";
import {
  handleAddToWishlist,
  handleRemoveFromWishlist,
  type WishlistContext,
} from "../WishlistCommandHandlers";
import type { WishlistRepository } from "../../../../infrastructure/repository/DrizzleWishlistRepository";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_PRODUCT_ID = "00000000-0000-4000-8000-000000000020";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

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

function makeContext(overrides: Partial<WishlistContext> = {}): WishlistContext {
  return {
    wishlistRepository: makeWishlistRepository(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// handleAddToWishlist
// ---------------------------------------------------------------------------

describe("handleAddToWishlist", () => {
  it("calls wishlistRepository.add with userId, productId, a UUID, and an ISO timestamp", async () => {
    const wishlistRepository = makeWishlistRepository();
    const ctx = makeContext({ wishlistRepository });

    await handleAddToWishlist(
      { userId: VALID_USER_ID, productId: VALID_PRODUCT_ID },
      ctx,
    );

    expect(wishlistRepository.add).toHaveBeenCalledOnce();
    const [userId, productId, id, createdAt] = (
      wishlistRepository.add as ReturnType<typeof vi.fn>
    ).mock.calls[0]!;
    expect(userId).toBe(VALID_USER_ID);
    expect(productId).toBe(VALID_PRODUCT_ID);
    expect(typeof id).toBe("string");
    expect(typeof createdAt).toBe("string");
    expect(new Date(createdAt).toISOString()).toBe(createdAt);
  });

  it("propagates WISHLIST_DUPLICATE thrown by repository", async () => {
    const wishlistRepository = makeWishlistRepository({
      add: vi.fn().mockRejectedValue({ code: "WISHLIST_DUPLICATE" }),
    });
    const ctx = makeContext({ wishlistRepository });

    await expect(
      handleAddToWishlist(
        { userId: VALID_USER_ID, productId: VALID_PRODUCT_ID },
        ctx,
      ),
    ).rejects.toMatchObject({ code: "WISHLIST_DUPLICATE" });
  });
});

// ---------------------------------------------------------------------------
// handleRemoveFromWishlist
// ---------------------------------------------------------------------------

describe("handleRemoveFromWishlist", () => {
  it("calls wishlistRepository.remove with userId and productId", async () => {
    const wishlistRepository = makeWishlistRepository();
    const ctx = makeContext({ wishlistRepository });

    await handleRemoveFromWishlist(
      { userId: VALID_USER_ID, productId: VALID_PRODUCT_ID },
      ctx,
    );

    expect(wishlistRepository.remove).toHaveBeenCalledWith(
      VALID_USER_ID,
      VALID_PRODUCT_ID,
    );
  });
});
