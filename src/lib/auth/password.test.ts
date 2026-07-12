import { describe, expect, it } from "vitest";
import { UNUSABLE_PASSWORD_HASH, hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a password against its own hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const hashA = await hashPassword("same password");
    const hashB = await hashPassword("same password");
    expect(hashA).not.toBe(hashB);
  });

  it("never validates against the unusable placeholder hash", async () => {
    expect(await verifyPassword("anything", UNUSABLE_PASSWORD_HASH)).toBe(false);
  });

  it("rejects a malformed stored hash instead of throwing", async () => {
    expect(await verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });
});
