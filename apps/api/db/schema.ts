import {
  integer,
  sqliteTable,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Event Store
// ---------------------------------------------------------------------------

export const domainEvents = sqliteTable(
  "domain_events",
  {
    id: text("id").notNull().primaryKey(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    version: integer("version").notNull(),
    eventType: text("event_type").notNull(),
    payload: text("payload").notNull(), // JSON-serialised event payload
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    // UNIQUE enforces optimistic-lock: two concurrent writes with the same
    // version on the same aggregate will cause a constraint violation.
    uniqueIndex("idx_events_aggregate_version").on(t.aggregateId, t.version),
  ]
);

// ---------------------------------------------------------------------------
// Read Models
// ---------------------------------------------------------------------------

export const productsRm = sqliteTable(
  "products_rm",
  {
    id: text("id").notNull().primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    price: integer("price").notNull(),
    categoryId: text("category_id").notNull(),
    stock: integer("stock").notNull().default(0),
    stockStatus: text("stock_status").notNull().default("IN_STOCK"), // IN_STOCK | OUT_OF_STOCK
    status: text("status").notNull().default("PUBLISHED"), // PUBLISHED | UNPUBLISHED
    imageUrls: text("image_urls").notNull().default("[]"), // JSON array of URLs
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("idx_products_category").on(t.categoryId),
    index("idx_products_status").on(t.status),
    index("idx_products_price").on(t.price),
  ]
);

export const categoriesRm = sqliteTable("categories_rm", {
  id: text("id").notNull().primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

export const ordersRm = sqliteTable(
  "orders_rm",
  {
    id: text("id").notNull().primaryKey(),
    customerId: text("customer_id").notNull(),
    status: text("status").notNull(), // ACCEPTED | SHIPPED | COMPLETED | CANCELLED
    items: text("items").notNull(), // JSON array of OrderItem
    shippingAddress: text("shipping_address").notNull(), // JSON object
    paymentMethod: text("payment_method").notNull(),
    subtotal: integer("subtotal").notNull(),
    shippingFee: integer("shipping_fee").notNull(),
    total: integer("total").notNull(),
    paymentCode: text("payment_code"), // convenience store payment code (nullable)
    paymentExpiresAt: text("payment_expires_at"), // convenience store payment deadline (nullable)
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("idx_orders_customer").on(t.customerId, t.createdAt),
    index("idx_orders_status").on(t.status),
    index("idx_orders_created").on(t.createdAt),
  ]
);

export const users = sqliteTable("users", {
  id: text("id").notNull().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("CUSTOMER"), // CUSTOMER | ADMIN
  emailVerified: integer("email_verified").notNull().default(0),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: text("locked_until"), // nullable; ISO-8601 timestamp
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const addresses = sqliteTable(
  "addresses",
  {
    id: text("id").notNull().primaryKey(),
    userId: text("user_id").notNull(),
    postalCode: text("postal_code").notNull(),
    prefecture: text("prefecture").notNull(),
    city: text("city").notNull(),
    street: text("street").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_addresses_user").on(t.userId)]
);

export const wishlists = sqliteTable(
  "wishlists",
  {
    id: text("id").notNull().primaryKey(),
    userId: text("user_id").notNull(),
    productId: text("product_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("uq_wishlists_user_product").on(t.userId, t.productId),
    index("idx_wishlists_user").on(t.userId, t.createdAt),
  ]
);

export const refreshTokens = sqliteTable(
  "refresh_tokens",
  {
    token: text("token").notNull().primaryKey(),
    userId: text("user_id").notNull(),
    expiresAt: text("expires_at").notNull(),
    invalidated: integer("invalidated").notNull().default(0),
  },
  (t) => [
    // Enables efficient lookup of all tokens for a user during password reset.
    index("idx_refresh_tokens_user").on(t.userId),
  ]
);

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  token: text("token").notNull().primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  used: integer("used").notNull().default(0),
});

export const emailVerificationTokens = sqliteTable(
  "email_verification_tokens",
  {
    token: text("token").notNull().primaryKey(),
    userId: text("user_id").notNull(),
    expiresAt: text("expires_at").notNull(),
    used: integer("used").notNull().default(0),
  }
);

export const emailSendAttempts = sqliteTable("email_send_attempts", {
  id: text("id").notNull().primaryKey(),
  orderId: text("order_id").notNull(),
  emailType: text("email_type").notNull(), // ORDER_CONFIRMATION | REFUND_NOTIFICATION
  attemptCount: integer("attempt_count").notNull().default(0), // 0–3; 3 means final failure
  lastError: text("last_error"), // nullable
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
