import { describe, expect, it } from "vitest";
import { hashIdempotencyRequest, normalizeIdempotencyKey } from "./idempotency";

describe("request idempotency helpers", () => {
  it("normalizes missing and padded keys", () => {
    expect(normalizeIdempotencyKey("  turn-123  ")).toBe("turn-123");
    expect(normalizeIdempotencyKey("   ")).toBeUndefined();
    expect(normalizeIdempotencyKey(undefined)).toBeUndefined();
  });

  it("creates a stable hash for the same parsed request", () => {
    const payload = { message: "Narita to Shinjuku", sessionId: "session-1" };
    expect(hashIdempotencyRequest(payload)).toBe(hashIdempotencyRequest(payload));
    expect(hashIdempotencyRequest(payload)).toHaveLength(64);
    expect(hashIdempotencyRequest(payload)).not.toBe(
      hashIdempotencyRequest({ ...payload, message: "Haneda to Shibuya" }),
    );
  });
});
