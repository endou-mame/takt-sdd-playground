import type {
  EmailService,
  EmailVerificationParams,
  OrderConfirmationParams,
  PasswordResetParams,
  RefundNotificationParams,
} from "./EmailService";

const RESEND_API_URL = "https://api.resend.com/emails";

type ResendPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
};

export class ResendEmailService implements EmailService {
  constructor(
    private readonly apiKey: string,
    private readonly fromAddress: string,
  ) {}

  async sendOrderConfirmation(params: OrderConfirmationParams): Promise<void> {
    const itemRows = params.items
      .map(
        (item) =>
          `<tr>
            <td>${item.name}</td>
            <td style="text-align:right;">${item.quantity}</td>
            <td style="text-align:right;">¥${item.subtotal.toLocaleString()}</td>
          </tr>`,
      )
      .join("\n");

    const addr = params.shippingAddress;
    const html = `
      <h2>ご注文ありがとうございます</h2>
      <p>注文番号: <strong>${params.orderId}</strong></p>
      <table border="1" cellpadding="4" cellspacing="0">
        <thead><tr><th>商品名</th><th>数量</th><th>小計</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <p>商品小計: ¥${params.subtotal.toLocaleString()}</p>
      <p>送料: ¥${params.shippingFee.toLocaleString()}</p>
      <p><strong>合計: ¥${params.total.toLocaleString()}</strong></p>
      <h3>お届け先</h3>
      <p>
        ${addr.recipientName} 様<br>
        〒${addr.postalCode}<br>
        ${addr.prefecture}${addr.city}${addr.street}
      </p>
    `;

    await this.send({
      to: params.to,
      subject: `【ご注文確認】注文番号 ${params.orderId}`,
      html,
    });
  }

  async sendPasswordReset(params: PasswordResetParams): Promise<void> {
    const html = `
      <h2>パスワードリセットのご案内</h2>
      <p>以下のリンクをクリックして、パスワードをリセットしてください。</p>
      <p>このリンクの有効期限は1時間です。</p>
      <p><a href="${params.resetLink}">${params.resetLink}</a></p>
      <p>このメールに心当たりがない場合は無視してください。</p>
    `;

    await this.send({
      to: params.to,
      subject: "パスワードリセットのご案内",
      html,
    });
  }

  async sendRefundNotification(
    params: RefundNotificationParams,
  ): Promise<void> {
    const html = `
      <h2>返金完了のお知らせ</h2>
      <p>注文番号 <strong>${params.orderId}</strong> の返金処理が完了しました。</p>
      <p>返金額: <strong>¥${params.amount.toLocaleString()}</strong></p>
      <p>返金はご利用のカード会社・支払い方法によって反映まで数日かかる場合があります。</p>
    `;

    await this.send({
      to: params.to,
      subject: `【返金完了】注文番号 ${params.orderId}`,
      html,
    });
  }

  async sendEmailVerification(
    params: EmailVerificationParams,
  ): Promise<void> {
    const html = `
      <h2>メールアドレスの確認</h2>
      <p>以下のリンクをクリックして、メールアドレスを確認してください。</p>
      <p><a href="${params.verificationLink}">${params.verificationLink}</a></p>
      <p>このメールに心当たりがない場合は無視してください。</p>
    `;

    await this.send({
      to: params.to,
      subject: "メールアドレスの確認",
      html,
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async send(opts: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const payload: ResendPayload = {
      from: this.fromAddress,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    };

    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = (await res.json()) as { message?: string };
      throw {
        code: "EMAIL_SEND_FAILED" as const,
        message: err.message ?? `HTTP ${res.status}`,
      };
    }
  }
}
