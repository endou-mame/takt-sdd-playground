import type { CategoryId } from "../shared/ValueObjects";

export type Category = {
  readonly id: CategoryId;
  readonly name: string;
};

const MIN_NAME_LENGTH = 1;
const MAX_NAME_LENGTH = 100;

export type CreateCategoryParams = {
  readonly id: CategoryId;
  readonly name: string;
};

export function createCategory(params: CreateCategoryParams): Category {
  const trimmed = params.name.trim();
  if (trimmed.length < MIN_NAME_LENGTH || trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(
      `Category name must be between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters`,
    );
  }
  return {
    id: params.id,
    name: trimmed,
  };
}
