import "server-only";

import { createHash } from "crypto";
import { isConfigured, supabaseFetch } from "@/lib/supabase/client";

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 20;

export type RateLimitOptions = {
  windowMs?: number;
  maxRequests?: number;
};

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, options: RateLimitOptions = {}): boolean {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const bucketKey = `${windowMs}:${maxRequests}:${key}`;
  const now = Date.now();
  const bucket = buckets.get(bucketKey);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(bucketKey, { count: 1, windowStart: now });
    return true;
  }

  if (bucket.count >= maxRequests) {
    return false;
  }

  bucket.count++;
  return true;
}

/**
 * Uses an atomic Supabase RPC in production so the limit is shared by every
 * serverless instance. Local development keeps the in-memory fallback.
 */
export async function checkDistributedRateLimit(
  key: string,
  options: RateLimitOptions = {},
): Promise<boolean> {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;

  if (!isConfigured()) return checkRateLimit(key, { windowMs, maxRequests });

  const privateKey = createHash("sha256").update(key).digest("hex");
  try {
    const response = await supabaseFetch("/rest/v1/rpc/consume_rate_limit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_bucket_key: privateKey,
        p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
        p_max_requests: maxRequests,
      }),
    });
    const allowed = (await response.json()) as unknown;
    return allowed === true;
  } catch {
    // A missing or unavailable production limiter must not silently disable
    // abuse protection. Development remains usable before migrations run.
    if (process.env.NODE_ENV === "production") return false;
    return checkRateLimit(key, { windowMs, maxRequests });
  }
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
