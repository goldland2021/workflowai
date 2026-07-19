import { createHash } from "node:crypto";

export function hashIdempotencyRequest(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function normalizeIdempotencyKey(value: string | null | undefined): string | undefined {
  const key = value?.trim();
  return key || undefined;
}
