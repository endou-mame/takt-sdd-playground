import type { ErrorHandler } from "hono";
import type { Bindings } from "../worker";

type AppError = {
  readonly code: string;
  readonly message?: string;
  readonly fields?: string[];
};

const ERROR_STATUS: Record<string, number> = {
  // 400 Bad Request
  VALIDATION_ERROR: 400,
  INVALID_EMAIL: 400,
  INVALID_PASSWORD: 400,
  INVALID_ADDRESS_FIELDS: 400,
  CART_EMPTY: 400,
  ADDRESS_BOOK_LIMIT_EXCEEDED: 400,
  UNSUPPORTED_IMAGE_FORMAT: 400,
  IMAGE_LIMIT_EXCEEDED: 400,
  // 401 Unauthorized
  INVALID_CREDENTIALS: 401,
  TOKEN_EXPIRED: 401,
  INVALID_TOKEN: 401,
  INVALID_REFRESH_TOKEN: 401,
  // 402 Payment Required
  PAYMENT_DECLINED: 402,
  // 403 Forbidden
  FORBIDDEN: 403,
  // 404 Not Found
  PRODUCT_NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
  ADDRESS_NOT_FOUND: 404,
  CATEGORY_NOT_FOUND: 404,
  CUSTOMER_NOT_FOUND: 404,
  // 409 Conflict
  DUPLICATE_EMAIL: 409,
  VERSION_CONFLICT: 409,
  WISHLIST_DUPLICATE: 409,
  CATEGORY_HAS_PRODUCTS: 409,
  CATEGORY_NAME_CONFLICT: 409,
  OUT_OF_STOCK: 409,
  INSUFFICIENT_STOCK: 409,
  ORDER_ALREADY_COMPLETED: 409,
  ORDER_ALREADY_CANCELLED: 409,
  ORDER_ALREADY_REFUNDED: 409,
  // 410 Gone
  VERIFICATION_TOKEN_EXPIRED: 410,
  VERIFICATION_TOKEN_USED: 410,
  // 413 Payload Too Large
  FILE_TOO_LARGE: 413,
  // 423 Locked
  ACCOUNT_LOCKED: 423,
  // 422 Unprocessable Entity
  ORDER_NOT_CANCELLED: 422,
  REFUND_TRANSACTION_NOT_FOUND: 422,
  INVALID_ORDER_STATUS_TRANSITION: 422,
  // 504 Gateway Timeout
  PAYMENT_TIMEOUT: 504,
};

function isAppError(err: unknown): err is AppError {
  return err !== null && typeof err === "object" && "code" in err;
}

export const errorHandler: ErrorHandler<{ Bindings: Bindings }> = (err, c) => {
  if (isAppError(err)) {
    const status = (ERROR_STATUS[err.code] ?? 500) as
      | 400
      | 401
      | 402
      | 403
      | 404
      | 409
      | 410
      | 413
      | 422
      | 423
      | 500
      | 504;
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message ?? err.code,
          fields: err.fields ?? [],
        },
      },
      status,
    );
  }

  const message = err instanceof Error ? err.message : "Internal Server Error";
  return c.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message,
        fields: [],
      },
    },
    500,
  );
};
