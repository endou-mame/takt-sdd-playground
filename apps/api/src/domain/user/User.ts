import type { Email, UserId } from "../shared/ValueObjects";

export type UserRole = "CUSTOMER" | "ADMIN";

export type User = {
  readonly id: UserId;
  readonly email: Email;
  readonly passwordHash: string;
  readonly name: string;
  readonly role: UserRole;
  readonly emailVerified: boolean;
  readonly failedLoginAttempts: number;
  readonly lockedUntil: Date | null;
  readonly version: number;
};

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export type CreateUserParams = {
  readonly id: UserId;
  readonly email: Email;
  readonly passwordHash: string;
  readonly name: string;
  readonly role: UserRole;
};

export function createUser(params: CreateUserParams): User {
  return {
    id: params.id,
    email: params.email,
    passwordHash: params.passwordHash,
    name: params.name,
    role: params.role,
    emailVerified: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    version: 0,
  };
}

export function isLocked(user: User): boolean {
  return user.lockedUntil !== null && user.lockedUntil > new Date();
}

export function recordLoginFailure(user: User): User {
  const newCount = user.failedLoginAttempts + 1;
  if (newCount >= MAX_FAILED_LOGIN_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
    return {
      ...user,
      failedLoginAttempts: newCount,
      lockedUntil,
    };
  }
  return {
    ...user,
    failedLoginAttempts: newCount,
  };
}

export function unlockAccount(user: User): User {
  return {
    ...user,
    failedLoginAttempts: 0,
    lockedUntil: null,
  };
}

export function verifyEmail(user: User): User {
  return {
    ...user,
    emailVerified: true,
  };
}

export function resetPassword(user: User, newPasswordHash: string): User {
  return {
    ...user,
    passwordHash: newPasswordHash,
  };
}
