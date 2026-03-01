import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleCreateCategory,
  handleDeleteCategory,
  type CategoryRepository,
  type CreateCategoryCommand,
  type DeleteCategoryCommand,
} from "../CategoryCommandHandlers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_CATEGORY_ID = "00000000-0000-4000-8000-000000000001";

function makeCategoryRepository(overrides: Partial<CategoryRepository> = {}): CategoryRepository {
  return {
    existsByName: vi.fn().mockResolvedValue(false),
    existsById: vi.fn().mockResolvedValue(true),
    hasProducts: vi.fn().mockResolvedValue(false),
    create: vi.fn().mockResolvedValue(undefined),
    deleteById: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// handleCreateCategory
// ---------------------------------------------------------------------------

describe("handleCreateCategory", () => {
  let repo: CategoryRepository;

  beforeEach(() => {
    repo = makeCategoryRepository();
  });

  it("creates a category and returns a categoryId", async () => {
    const cmd: CreateCategoryCommand = { name: "Electronics" };
    const result = await handleCreateCategory(cmd, { categoryRepository: repo });

    expect(result.categoryId).toBeTypeOf("string");
    expect(repo.create).toHaveBeenCalledOnce();
    const [calledId, calledName] = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(calledId).toBe(result.categoryId);
    expect(calledName).toBe("Electronics");
  });

  it("trims whitespace from the name before persisting", async () => {
    const cmd: CreateCategoryCommand = { name: "  Books  " };
    await handleCreateCategory(cmd, { categoryRepository: repo });
    const [, calledName] = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(calledName).toBe("Books");
  });

  it("throws CATEGORY_NAME_CONFLICT when name already exists", async () => {
    const conflictRepo = makeCategoryRepository({
      existsByName: vi.fn().mockResolvedValue(true),
    });
    const cmd: CreateCategoryCommand = { name: "Electronics" };
    await expect(
      handleCreateCategory(cmd, { categoryRepository: conflictRepo }),
    ).rejects.toMatchObject({ code: "CATEGORY_NAME_CONFLICT" });
    expect(conflictRepo.create).not.toHaveBeenCalled();
  });

  it("throws for name that is empty string", async () => {
    const cmd: CreateCategoryCommand = { name: "" };
    await expect(
      handleCreateCategory(cmd, { categoryRepository: repo }),
    ).rejects.toThrow();
  });

  it("throws for name exceeding 100 characters", async () => {
    const cmd: CreateCategoryCommand = { name: "a".repeat(101) };
    await expect(
      handleCreateCategory(cmd, { categoryRepository: repo }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleDeleteCategory
// ---------------------------------------------------------------------------

describe("handleDeleteCategory", () => {
  let repo: CategoryRepository;

  beforeEach(() => {
    repo = makeCategoryRepository();
  });

  it("deletes a category when it has no products", async () => {
    const cmd: DeleteCategoryCommand = { categoryId: VALID_CATEGORY_ID };
    await handleDeleteCategory(cmd, { categoryRepository: repo });

    expect(repo.deleteById).toHaveBeenCalledOnce();
    expect(repo.deleteById).toHaveBeenCalledWith(VALID_CATEGORY_ID);
  });

  it("throws CATEGORY_NOT_FOUND when the category does not exist", async () => {
    const notFoundRepo = makeCategoryRepository({
      existsById: vi.fn().mockResolvedValue(false),
    });
    const cmd: DeleteCategoryCommand = { categoryId: VALID_CATEGORY_ID };
    await expect(
      handleDeleteCategory(cmd, { categoryRepository: notFoundRepo }),
    ).rejects.toMatchObject({ code: "CATEGORY_NOT_FOUND" });
    expect(notFoundRepo.deleteById).not.toHaveBeenCalled();
  });

  it("throws CATEGORY_HAS_PRODUCTS when products exist in the category", async () => {
    const blockedRepo = makeCategoryRepository({
      hasProducts: vi.fn().mockResolvedValue(true),
    });
    const cmd: DeleteCategoryCommand = { categoryId: VALID_CATEGORY_ID };
    await expect(
      handleDeleteCategory(cmd, { categoryRepository: blockedRepo }),
    ).rejects.toMatchObject({ code: "CATEGORY_HAS_PRODUCTS" });
    expect(blockedRepo.deleteById).not.toHaveBeenCalled();
  });

  it("throws Zod error for invalid categoryId", async () => {
    const cmd: DeleteCategoryCommand = { categoryId: "not-a-uuid" };
    await expect(handleDeleteCategory(cmd, { categoryRepository: repo })).rejects.toThrow();
  });
});
