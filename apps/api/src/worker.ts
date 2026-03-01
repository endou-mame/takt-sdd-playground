import { Hono } from "hono";
import { handleEmailQueue } from "./infrastructure/email/EmailQueueConsumer";
import type { EmailQueueMessage } from "./infrastructure/email/EmailQueueProducer";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/customer/auth";
import { productsPublicRouter } from "./routes/customer/products";
import { cartRouter } from "./routes/customer/cart";
import { checkoutRouter } from "./routes/customer/checkout";
import { customerOrdersRouter } from "./routes/customer/orders";
import { wishlistRouter } from "./routes/customer/wishlist";
import { addressesRouter } from "./routes/customer/addresses";
import { adminProductsRouter } from "./routes/admin/products";
import { adminCategoriesRouter } from "./routes/admin/categories";
import { adminOrdersRouter } from "./routes/admin/orders";
import { adminCustomersRouter } from "./routes/admin/customers";
import { adminImagesRouter } from "./routes/admin/images";

export type Bindings = {
  readonly EVENTS_DB: D1Database;
  readonly IMAGE_BUCKET: R2Bucket;
  readonly CART_DO: DurableObjectNamespace;
  readonly EMAIL_QUEUE: Queue<EmailQueueMessage>;
  readonly RESEND_API_KEY: string;
  readonly RESEND_FROM_ADDRESS: string;
  readonly JWT_SECRET: string;
  readonly APP_BASE_URL: string;
  readonly STRIPE_API_KEY: string;
  readonly R2_PUBLIC_URL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.onError(errorHandler);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Customer routes
app.route("/", productsPublicRouter);
app.route("/auth", authRouter);
app.route("/cart", cartRouter);
app.route("/checkout", checkoutRouter);
app.route("/orders", customerOrdersRouter);
app.route("/wishlist", wishlistRouter);
app.route("/addresses", addressesRouter);

// Admin routes
app.route("/admin", adminProductsRouter);
app.route("/admin", adminCategoriesRouter);
app.route("/admin", adminOrdersRouter);
app.route("/admin", adminCustomersRouter);
app.route("/admin", adminImagesRouter);

export default {
  fetch: app.fetch,
  queue: handleEmailQueue,
};
