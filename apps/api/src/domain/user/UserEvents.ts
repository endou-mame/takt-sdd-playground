import type { DomainEventEnvelope } from "../shared/DomainEvent";

// Security principle: password hashes, reset tokens, and verification tokens
// are never included in event payloads to prevent sensitive data persisting
// in the immutable event store.
export type UserEvent =
  | {
      readonly type: "UserRegistered";
      readonly userId: string;
      readonly email: string;
      readonly name: string;
    }
  | {
      readonly type: "EmailVerified";
      readonly userId: string;
    }
  | {
      readonly type: "PasswordResetRequested";
      readonly userId: string;
    }
  | {
      readonly type: "PasswordReset";
      readonly userId: string;
    }
  | {
      readonly type: "LoginFailed";
      readonly userId: string;
    }
  | {
      readonly type: "AccountLocked";
      readonly userId: string;
      readonly lockedUntil: string; // ISO-8601
    }
  | {
      readonly type: "AccountUnlocked";
      readonly userId: string;
    };

export type UserEventEnvelope = DomainEventEnvelope<UserEvent>;
