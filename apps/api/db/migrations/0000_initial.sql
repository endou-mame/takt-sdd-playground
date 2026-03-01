-- Migration: 0000_initial
-- Creates all tables for the event store and read models.

-- ---------------------------------------------------------------------------
-- Event Store
-- ---------------------------------------------------------------------------

CREATE TABLE domain_events (
  id             TEXT    NOT NULL PRIMARY KEY,
  aggregate_type TEXT    NOT NULL,
  aggregate_id   TEXT    NOT NULL,
  version        INTEGER NOT NULL,
  event_type     TEXT    NOT NULL,
  payload        TEXT    NOT NULL,
  created_at     TEXT    NOT NULL,
  -- Optimistic lock: concurrent writes with the same (aggregate_id, version)
  -- will fail with a UNIQUE constraint violation (VERSION_CONFLICT).
  UNIQUE (aggregate_id, version)
);
CREATE INDEX idx_events_aggregate_version ON domain_events (aggregate_id, version);

-- ---------------------------------------------------------------------------
-- Read Models
-- ---------------------------------------------------------------------------

CREATE TABLE products_rm (
  id           TEXT    NOT NULL PRIMARY KEY,
  name         TEXT    NOT NULL,
  description  TEXT    NOT NULL,
  price        INTEGER NOT NULL,
  category_id  TEXT    NOT NULL,
  stock        INTEGER NOT NULL DEFAULT 0,
  stock_status TEXT    NOT NULL DEFAULT 'IN_STOCK',   -- IN_STOCK | OUT_OF_STOCK
  status       TEXT    NOT NULL DEFAULT 'PUBLISHED',  -- PUBLISHED | UNPUBLISHED
  image_urls   TEXT    NOT NULL DEFAULT '[]',         -- JSON array of URLs
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);
CREATE INDEX idx_products_category ON products_rm (category_id);
CREATE INDEX idx_products_status   ON products_rm (status);
CREATE INDEX idx_products_price    ON products_rm (price);

CREATE TABLE categories_rm (
  id         TEXT NOT NULL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE orders_rm (
  id                 TEXT    NOT NULL PRIMARY KEY,
  customer_id        TEXT    NOT NULL,
  status             TEXT    NOT NULL,           -- ACCEPTED | SHIPPED | COMPLETED | CANCELLED
  items              TEXT    NOT NULL,           -- JSON array of OrderItem
  shipping_address   TEXT    NOT NULL,           -- JSON object of ShippingAddress
  payment_method     TEXT    NOT NULL,
  subtotal           INTEGER NOT NULL,
  shipping_fee       INTEGER NOT NULL,
  total              INTEGER NOT NULL,
  payment_code       TEXT,                       -- convenience store payment code (nullable)
  payment_expires_at TEXT,                       -- convenience store payment deadline (nullable)
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL
);
CREATE INDEX idx_orders_customer ON orders_rm (customer_id, created_at DESC);
CREATE INDEX idx_orders_status   ON orders_rm (status);
CREATE INDEX idx_orders_created  ON orders_rm (created_at DESC);

CREATE TABLE users (
  id                    TEXT    NOT NULL PRIMARY KEY,
  email                 TEXT    NOT NULL UNIQUE,
  password_hash         TEXT    NOT NULL,
  name                  TEXT    NOT NULL,
  role                  TEXT    NOT NULL DEFAULT 'CUSTOMER',
  email_verified        INTEGER NOT NULL DEFAULT 0,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until          TEXT,
  created_at            TEXT    NOT NULL,
  updated_at            TEXT    NOT NULL
);

CREATE TABLE addresses (
  id          TEXT NOT NULL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  prefecture  TEXT NOT NULL,
  city        TEXT NOT NULL,
  street      TEXT NOT NULL,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_addresses_user ON addresses (user_id);

CREATE TABLE wishlists (
  id         TEXT NOT NULL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  product_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, product_id)
);
CREATE INDEX idx_wishlists_user ON wishlists (user_id, created_at DESC);

CREATE TABLE refresh_tokens (
  token       TEXT    NOT NULL PRIMARY KEY,
  user_id     TEXT    NOT NULL,
  expires_at  TEXT    NOT NULL,
  invalidated INTEGER NOT NULL DEFAULT 0
);
-- Enables efficient lookup of all tokens for a user during password reset.
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);

CREATE TABLE password_reset_tokens (
  token      TEXT    NOT NULL PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  expires_at TEXT    NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE email_verification_tokens (
  token      TEXT    NOT NULL PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  expires_at TEXT    NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE email_send_attempts (
  id            TEXT    NOT NULL PRIMARY KEY,
  order_id      TEXT    NOT NULL,
  email_type    TEXT    NOT NULL,               -- ORDER_CONFIRMATION | REFUND_NOTIFICATION
  attempt_count INTEGER NOT NULL DEFAULT 0,     -- 0–3; 3 means final failure
  last_error    TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);
