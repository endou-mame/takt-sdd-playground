import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import { emailSendAttempts } from "../../../db/schema";

type Db = ReturnType<typeof drizzle>;

export type EmailType = "ORDER_CONFIRMATION" | "REFUND_NOTIFICATION";

export type EmailSendAttemptRow = {
  readonly id: string;
  readonly orderId: string;
  readonly emailType: EmailType;
  readonly attemptCount: number;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

// Maximum number of delivery attempts before giving up.
export const MAX_ATTEMPTS = 3;

export class EmailRetryRepository {
  private readonly db: Db;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async findByOrderAndType(
    orderId: string,
    emailType: EmailType,
  ): Promise<EmailSendAttemptRow | null> {
    const rows = await this.db
      .select()
      .from(emailSendAttempts)
      .where(
        and(
          eq(emailSendAttempts.orderId, orderId),
          eq(emailSendAttempts.emailType, emailType),
        ),
      );

    const row = rows[0];
    return row ? toRow(row) : null;
  }

  async create(
    orderId: string,
    emailType: EmailType,
  ): Promise<EmailSendAttemptRow> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db.insert(emailSendAttempts).values({
      id,
      orderId,
      emailType,
      attemptCount: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    });

    return { id, orderId, emailType, attemptCount: 0, lastError: null, createdAt: now, updatedAt: now };
  }

  // Increments attempt_count and records the error message.
  // Returns the new attempt_count.
  async recordFailedAttempt(
    id: string,
    lastError: string,
  ): Promise<number> {
    const rows = await this.db
      .select()
      .from(emailSendAttempts)
      .where(eq(emailSendAttempts.id, id));

    const row = rows[0];
    if (!row) {
      throw new Error(`EmailSendAttempt not found: ${id}`);
    }

    const newCount = row.attemptCount + 1;
    const now = new Date().toISOString();

    await this.db
      .update(emailSendAttempts)
      .set({ attemptCount: newCount, lastError, updatedAt: now })
      .where(eq(emailSendAttempts.id, id));

    return newCount;
  }
}

function toRow(row: typeof emailSendAttempts.$inferSelect): EmailSendAttemptRow {
  return {
    id: row.id,
    orderId: row.orderId,
    emailType: row.emailType as EmailType,
    attemptCount: row.attemptCount,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
