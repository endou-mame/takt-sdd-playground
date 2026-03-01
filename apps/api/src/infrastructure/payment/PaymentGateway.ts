// Payment method types and result types for the PaymentGateway interface.

export type CreditCardChargeParams = {
  readonly cardNumber: string; // never log, never store
  readonly cvv: string; // never log, never store
  readonly expiryMonth: string;
  readonly expiryYear: string;
  readonly amount: number; // 円単位 (integer)
  readonly orderId: string;
};

export type ChargeResult = {
  readonly transactionId: string;
};

export type ConvStoreParams = {
  readonly orderId: string;
  readonly amount: number;
  readonly expiresAt: string; // ISO-8601 (72時間後)
};

export type ConvStoreResult = {
  readonly paymentCode: string;
  readonly expiresAt: string;
};

export type RefundResult = {
  readonly refundId: string;
};

export interface PaymentGateway {
  // throws { code: 'PAYMENT_DECLINED' } on card decline
  chargeCreditCard(params: CreditCardChargeParams): Promise<ChargeResult>;

  issueConvenienceStorePayment(
    params: ConvStoreParams,
  ): Promise<ConvStoreResult>;

  refund(transactionId: string, amount: number): Promise<RefundResult>;

  voidConvenienceStorePayment(paymentCode: string): Promise<void>;
}
