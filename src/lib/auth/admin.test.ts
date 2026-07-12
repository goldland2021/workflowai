import { afterEach, describe, expect, it, vi } from "vitest";
import { createSession, verifySession } from "./admin";

describe("session tokens", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the company ID the token was issued for", () => {
    const token = createSession("company-123");
    expect(verifySession(token)).toBe("company-123");
  });

  it("rejects an undefined token", () => {
    expect(verifySession(undefined)).toBeNull();
  });

  it("rejects a token with a tampered signature", () => {
    const token = createSession("company-123");
    const [companyId, createdAt, nonce, signature] = token.split(".");
    const tampered = `${companyId}.${createdAt}.${nonce}.${signature.slice(0, -1)}x`;
    expect(verifySession(tampered)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifySession("not-a-real-token")).toBeNull();
    expect(verifySession("only.three.parts")).toBeNull();
  });

  it("rejects a token whose company ID was swapped after signing", () => {
    const token = createSession("company-123");
    const [, createdAt, nonce, signature] = token.split(".");
    const forged = `company-456.${createdAt}.${nonce}.${signature}`;
    expect(verifySession(forged)).toBeNull();
  });

  it("rejects a token whose timestamp was altered after signing", () => {
    const token = createSession("company-123");
    const [companyId, createdAt, nonce, signature] = token.split(".");
    const forged = `${companyId}.${Number(createdAt) + 1000}.${nonce}.${signature}`;
    expect(verifySession(forged)).toBeNull();
  });

  it("rejects a session older than the 24h max age", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = createSession("company-123");

    vi.setSystemTime(new Date("2026-01-02T00:00:01Z")); // 24h + 1s later
    expect(verifySession(token)).toBeNull();
  });
});
