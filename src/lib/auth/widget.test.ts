import { describe, expect, it } from "vitest";
import { createWidgetToken, isWidgetOriginAllowed, normalizeWidgetOrigin, verifyWidgetToken } from "./widget";

describe("widget credentials", () => {
  it("accepts a token for its company and rejects another company", () => {
    const token = createWidgetToken("company-123", 2);

    expect(verifyWidgetToken("company-123", token, 2)).toBe(true);
    expect(verifyWidgetToken("company-456", token, 2)).toBe(false);
    expect(verifyWidgetToken("company-123", token, 1)).toBe(false);
  });

  it("normalizes and enforces exact website origins", () => {
    expect(normalizeWidgetOrigin("https://example.com/contact?from=widget")).toBe("https://example.com");
    expect(isWidgetOriginAllowed("https://example.com/page", ["https://example.com"])).toBe(true);
    expect(isWidgetOriginAllowed("https://evil.example.com", ["https://example.com"])).toBe(false);
  });
});
