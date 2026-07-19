import { describe, expect, it } from "vitest";
import { redactContactDetails } from "./pii";

describe("AI prompt PII redaction", () => {
  it("redacts email addresses and phone-like contact values", () => {
    expect(redactContactDetails("Email me at guest@example.com or WhatsApp +81 90 1234 5678.")).toBe(
      "Email me at [email redacted] or WhatsApp [phone redacted].",
    );
  });

  it("keeps normal travel details intact", () => {
    expect(redactContactDetails("Narita Terminal 1 on 2026-07-19 at 10:30.")).toBe(
      "Narita Terminal 1 on 2026-07-19 at 10:30.",
    );
  });
});
