import "server-only";

import { checkDistributedRateLimit, getClientIp } from "@/lib/ai/rate-limit";

type AuthLimit = {
  action: "login" | "register" | "password-reset-request" | "password-reset-complete";
  ip: { windowMs: number; maxRequests: number };
  identifier?: string;
  identifierLimit?: { windowMs: number; maxRequests: number };
};

export async function checkAuthRateLimit(request: Request, limit: AuthLimit): Promise<boolean> {
  const checks = [
    checkDistributedRateLimit(`auth:${limit.action}:ip:${getClientIp(request)}`, limit.ip),
  ];

  if (limit.identifier && limit.identifierLimit) {
    checks.push(
      checkDistributedRateLimit(
        `auth:${limit.action}:identifier:${limit.identifier.trim().toLowerCase()}`,
        limit.identifierLimit,
      ),
    );
  }

  const results = await Promise.all(checks);
  return results.every(Boolean);
}
