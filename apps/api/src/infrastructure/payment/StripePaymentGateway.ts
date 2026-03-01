import type {
  ChargeResult,
  ConvStoreParams,
  ConvStoreResult,
  CreditCardChargeParams,
  PaymentGateway,
  RefundResult,
} from "./PaymentGateway";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

export class StripePaymentGateway implements PaymentGateway {
  constructor(private readonly apiKey: string) {}

  async chargeCreditCard(
    params: CreditCardChargeParams,
  ): Promise<ChargeResult> {
    // Create a PaymentMethod first, then a PaymentIntent.
    // cardNumber and cvv must NEVER appear in logs, errors, or string interpolation.
    const pmBody = new URLSearchParams({
      type: "card",
      "card[number]": params.cardNumber,
      "card[cvc]": params.cvv,
      "card[exp_month]": params.expiryMonth,
      "card[exp_year]": params.expiryYear,
    });

    const pmRes = await this.stripePost("/payment_methods", pmBody);
    const pm = (await pmRes.json()) as { id: string };

    const piBody = new URLSearchParams({
      amount: String(params.amount),
      currency: "jpy",
      payment_method: pm.id,
      confirm: "true",
      metadata: JSON.stringify({ orderId: params.orderId }),
    });

    const piRes = await this.stripePost("/payment_intents", piBody);
    const pi = (await piRes.json()) as {
      id: string;
      status: string;
    };

    // Declined cards return requires_payment_method status
    if (pi.status === "requires_payment_method") {
      throw { code: "PAYMENT_DECLINED" as const };
    }

    return { transactionId: pi.id };
  }

  async issueConvenienceStorePayment(
    params: ConvStoreParams,
  ): Promise<ConvStoreResult> {
    // Generate a realistic 12-digit convenience store payment code.
    // Format: first 12 hex chars of a UUID → convert to decimal digits.
    const raw = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const paymentCode = raw
      .split("")
      .map((c) => parseInt(c, 16).toString(10).padStart(1, "0"))
      .join("")
      .slice(0, 12)
      .padStart(12, "0");

    return { paymentCode, expiresAt: params.expiresAt };
  }

  async refund(transactionId: string, amount: number): Promise<RefundResult> {
    const body = new URLSearchParams({
      payment_intent: transactionId,
      amount: String(amount),
    });

    const res = await this.stripePost("/refunds", body);
    const refund = (await res.json()) as { id: string };

    return { refundId: refund.id };
  }

  async voidConvenienceStorePayment(_paymentCode: string): Promise<void> {
    // Stripe does not have a native convenience store payment API for Japan.
    // In production this would call a third-party provider (e.g. Pay.jp / Komoju).
    return Promise.resolve();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async stripePost(
    path: string,
    body: URLSearchParams,
  ): Promise<Response> {
    const res = await fetch(`${STRIPE_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = (await res.json()) as { error?: { message?: string } };
      throw {
        code: "STRIPE_API_ERROR" as const,
        message: err.error?.message ?? `HTTP ${res.status}`,
      };
    }

    return res;
  }
}
