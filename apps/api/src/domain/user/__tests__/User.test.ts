import { describe, it, expect } from "vitest";
import type { Email, UserId } from "../../shared/ValueObjects";
import {
  createUser,
  isLocked,
  recordLoginFailure,
  unlockAccount,
  verifyEmail,
  resetPassword,
} from "../User";

const USER_ID = "550e8400-e29b-41d4-a716-446655440000" as UserId;
const EMAIL = "test@example.com" as Email;

function makeUser() {
  return createUser({
    id: USER_ID,
    email: EMAIL,
    passwordHash: "bcrypt-hash",
    name: "Test User",
    role: "CUSTOMER",
  });
}

// ---------------------------------------------------------------------------
// recordLoginFailure
// ---------------------------------------------------------------------------

describe("recordLoginFailure", () => {
  it("increments failedLoginAttempts without locking on 1st failure", () => {
    const user = makeUser();
    const updated = recordLoginFailure(user);
    expect(updated.failedLoginAttempts).toBe(1);
    expect(updated.lockedUntil).toBeNull();
  });

  it("increments failedLoginAttempts without locking on 4th failure", () => {
    let user = makeUser();
    for (let i = 0; i < 4; i++) {
      user = recordLoginFailure(user);
    }
    expect(user.failedLoginAttempts).toBe(4);
    expect(user.lockedUntil).toBeNull();
  });

  it("sets lockedUntil to a future date on 5th failure", () => {
    let user = makeUser();
    for (let i = 0; i < 5; i++) {
      user = recordLoginFailure(user);
    }
    expect(user.failedLoginAttempts).toBe(5);
    expect(user.lockedUntil).not.toBeNull();
    expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });
});

// ---------------------------------------------------------------------------
// isLocked
// ---------------------------------------------------------------------------

describe("isLocked", () => {
  it("returns false when lockedUntil is null", () => {
    const user = makeUser();
    expect(isLocked(user)).toBe(false);
  });

  it("returns false when lockedUntil is in the past (lock expired)", () => {
    const user = { ...makeUser(), lockedUntil: new Date(Date.now() - 1000) };
    expect(isLocked(user)).toBe(false);
  });

  it("returns true when lockedUntil is in the future", () => {
    const user = { ...makeUser(), lockedUntil: new Date(Date.now() + 900_000) };
    expect(isLocked(user)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// unlockAccount
// ---------------------------------------------------------------------------

describe("unlockAccount", () => {
  it("resets failedLoginAttempts to 0 and clears lockedUntil", () => {
    let user = makeUser();
    for (let i = 0; i < 5; i++) {
      user = recordLoginFailure(user);
    }
    const unlocked = unlockAccount(user);
    expect(unlocked.failedLoginAttempts).toBe(0);
    expect(unlocked.lockedUntil).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// verifyEmail
// ---------------------------------------------------------------------------

describe("verifyEmail", () => {
  it("sets emailVerified to true", () => {
    const user = makeUser();
    expect(user.emailVerified).toBe(false);
    const verified = verifyEmail(user);
    expect(verified.emailVerified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resetPassword
// ---------------------------------------------------------------------------

describe("resetPassword", () => {
  it("updates the passwordHash", () => {
    const user = makeUser();
    const newHash = "new-bcrypt-hash-$2b$12$xxxxx";
    const updated = resetPassword(user, newHash);
    expect(updated.passwordHash).toBe(newHash);
  });
});
