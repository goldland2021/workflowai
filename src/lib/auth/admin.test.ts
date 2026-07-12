import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminSession, verifyAdminSession } from "./admin";

describe("admin session tokens", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a freshly created session token", () => {
    const token = createAdminSession();
    expect(verifyAdminSession(token)).toBe(true);
  });

  it("rejects an undefined token", () => {
    expect(verifyAdminSession(undefined)).toBe(false);
  });

  it("rejects a token with a tampered signature", () => {
    const token = createAdminSession();
    const [createdAt, nonce, signature] = token.split(".");
    const tampered = `${createdAt}.${nonce}.${signature.slice(0, -1)}x`;
    expect(verifyAdminSession(tampered)).toBe(false);
  });

  it("rejects a malformed token", () => {
    expect(verifyAdminSession("not-a-real-token")).toBe(false);
    expect(verifyAdminSession("only.two")).toBe(false);
  });

  it("rejects a token whose timestamp was altered after signing", () => {
    const token = createAdminSession();
    const [createdAt, nonce, signature] = token.split(".");
    const forged = `${Number(createdAt) + 1000}.${nonce}.${signature}`;
    expect(verifyAdminSession(forged)).toBe(false);
  });

  it("rejects a session older than the 24h max age", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = createAdminSession();

    vi.setSystemTime(new Date("2026-01-02T00:00:01Z")); // 24h + 1s later
    expect(verifyAdminSession(token)).toBe(false);
  });
});
