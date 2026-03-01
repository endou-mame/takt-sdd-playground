import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { users } from "../../../db/schema";
import type { UserEvent } from "../../domain/user/UserEvents";

type Db = ReturnType<typeof drizzle>;

export class UserProjection {
  private readonly db: Db;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async apply(event: UserEvent): Promise<void> {
    const now = new Date().toISOString();

    switch (event.type) {
      case "EmailVerified":
        // SQLite stores booleans as INTEGER; 1 = true
        await this.db
          .update(users)
          .set({ emailVerified: 1, updatedAt: now })
          .where(eq(users.id, event.userId));
        break;

      case "UserRegistered":
      case "PasswordResetRequested":
      case "PasswordReset":
      case "LoginFailed":
      case "AccountLocked":
      case "AccountUnlocked":
        // No read-model update needed for these events; handled by application layer directly
        break;
    }
  }
}
