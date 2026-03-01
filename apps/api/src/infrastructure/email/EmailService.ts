// Email message parameter types and the EmailService interface.

export type OrderItem = {
  readonly name: string;
  readonly quantity: number;
  readonly subtotal: number;
};

export type ShippingAddress = {
  readonly recipientName: string;
  readonly postalCode: string;
  readonly prefecture: string;
  readonly city: string;
  readonly street: string;
};

export type OrderConfirmationParams = {
  readonly to: string;
  readonly orderId: string;
  readonly items: readonly OrderItem[];
  readonly subtotal: number;
  readonly shippingFee: number;
  readonly total: number;
  readonly shippingAddress: ShippingAddress;
};

export type PasswordResetParams = {
  readonly to: string;
  readonly resetLink: string; // URL containing a token valid for 1 hour
};

export type RefundNotificationParams = {
  readonly to: string;
  readonly orderId: string;
  readonly amount: number;
};

export type EmailVerificationParams = {
  readonly to: string;
  readonly verificationLink: string;
};

export interface EmailService {
  sendOrderConfirmation(params: OrderConfirmationParams): Promise<void>;
  sendPasswordReset(params: PasswordResetParams): Promise<void>;
  sendRefundNotification(params: RefundNotificationParams): Promise<void>;
  sendEmailVerification(params: EmailVerificationParams): Promise<void>;
}
