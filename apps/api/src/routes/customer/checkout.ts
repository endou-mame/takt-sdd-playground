import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "../../worker";
import type { AuthVariables } from "../../middleware/authMiddleware";
import { authMiddleware } from "../../middleware/authMiddleware";
import { handleCheckout } from "../../application/order/commands/CheckoutCommandHandlers";
import { D1EventStore } from "../../infrastructure/event-store/D1EventStore";
import { DrizzleUserRepository } from "../../infrastructure/repository/DrizzleUserRepository";
import { OrderProjection } from "../../infrastructure/projection/OrderProjection";
import { ProductProjection } from "../../infrastructure/projection/ProductProjection";
import { StripePaymentGateway } from "../../infrastructure/payment/StripePaymentGateway";
import { CloudflareEmailQueueProducer } from "../../infrastructure/email/EmailQueueProducer";
import { EmailRetryRepository } from "../../infrastructure/email/EmailRetryRepository";
import { toValidationErrorResponse } from "../utils";

type AppEnv = { Bindings: Bindings; Variables: AuthVariables };

export const checkoutRouter = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ShippingAddressSchema = z.object({
  recipientName: z.string(),
  postalCode: z.string(),
  prefecture: z.string(),
  city: z.string(),
  street: z.string(),
  phone: z.string(),
});

const CartItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  unitPrice: z.number(),
  quantity: z.number().int().positive(),
});

const CreditCardSchema = z.object({
  cardNumber: z.string(),
  cvv: z.string(),
  expiryMonth: z.string(),
  expiryYear: z.string(),
});

const CheckoutSchema = z.object({
  cartItems: z.array(CartItemSchema).min(1),
  shippingAddress: ShippingAddressSchema,
  paymentMethod: z.enum(["CREDIT_CARD", "CONVENIENCE_STORE", "CASH_ON_DELIVERY"]),
  creditCard: CreditCardSchema.optional(),
});

// ---------------------------------------------------------------------------
// POST /checkout
// ---------------------------------------------------------------------------

checkoutRouter.post("/", authMiddleware, async (c) => {
  const body = await c.req.json<unknown>();
  const result = CheckoutSchema.safeParse(body);
  if (!result.success) {
    return c.json(toValidationErrorResponse(result.error.issues), 400);
  }

  const userId = c.get("userId");
  const userRepository = new DrizzleUserRepository(c.env.EVENTS_DB);
  const user = await userRepository.findById(userId);
  if (!user) {
    throw { code: "CUSTOMER_NOT_FOUND" as const };
  }

  const ctx = {
    eventStore: new D1EventStore(c.env.EVENTS_DB),
    orderProjection: new OrderProjection(c.env.EVENTS_DB),
    productProjection: new ProductProjection(c.env.EVENTS_DB),
    paymentGateway: new StripePaymentGateway(c.env.STRIPE_API_KEY),
    emailQueueProducer: new CloudflareEmailQueueProducer(
      c.env.EMAIL_QUEUE,
      new EmailRetryRepository(c.env.EVENTS_DB),
    ),
  };

  const { orderId } = await handleCheckout(
    {
      customerId: userId,
      cartItems: result.data.cartItems,
      shippingAddress: result.data.shippingAddress,
      paymentMethod: result.data.paymentMethod,
      ...(result.data.creditCard !== undefined && { creditCard: result.data.creditCard }),
      customerEmail: user.email,
    },
    ctx,
  );

  return c.json({ orderId }, 201);
});
