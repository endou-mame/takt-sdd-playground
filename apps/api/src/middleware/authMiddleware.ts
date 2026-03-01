import { createMiddleware } from "hono/factory";
import { verifyAccessToken } from "../infrastructure/auth/JwtService";
import type { Bindings } from "../worker";

export type AuthVariables = {
  userId: string;
  role: "CUSTOMER" | "ADMIN";
};

type AuthEnv = { Bindings: Bindings; Variables: AuthVariables };

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const token = extractBearerToken(c.req.header("Authorization"));
  if (!token) {
    // Hono 4 only calls onError for Error instances — plain objects are re-thrown.
    throw Object.assign(new Error("INVALID_TOKEN"), { code: "INVALID_TOKEN" as const });
  }
  const payload = await verifyAccessToken(token, c.env.JWT_SECRET);
  c.set("userId", payload.sub);
  c.set("role", payload.role);
  await next();
});

export const adminMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  if (c.get("role") !== "ADMIN") {
    throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" as const });
  }
  await next();
});
