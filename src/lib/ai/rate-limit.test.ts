import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the window limit and then blocks", () => {
    const key = `test-key-${Math.random()}`;

    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit(key)).toBe(true);
    }

    expect(checkRateLimit(key)).toBe(false);
  });

  it("tracks separate keys independently", () => {
    const keyA = `a-${Math.random()}`;
    const keyB = `b-${Math.random()}`;

    for (let i = 0; i < 20; i++) checkRateLimit(keyA);

    expect(checkRateLimit(keyA)).toBe(false);
    expect(checkRateLimit(keyB)).toBe(true);
  });

  it("resets once the window elapses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const key = `reset-${Math.random()}`;
    for (let i = 0; i < 20; i++) checkRateLimit(key);
    expect(checkRateLimit(key)).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:01:01Z")); // 61s later
    expect(checkRateLimit(key)).toBe(true);
  });
});
