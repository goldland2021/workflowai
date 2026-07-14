import { beforeEach, describe, expect, it } from "vitest";
import { cacheReply, clearCache, findCachedReply } from "./reply-cache";

describe("reply cache", () => {
  const companyA = "company-cache-a";
  const companyB = "company-cache-b";

  beforeEach(() => {
    clearCache(companyA);
    clearCache(companyB);
  });

  it("reuses only the same normalized message", () => {
    cacheReply(companyA, "What services do you provide?", "Airport transfers and charters.");

    expect(findCachedReply(companyA, "WHAT SERVICES DO YOU PROVIDE!!!")).toBe(
      "Airport transfers and charters.",
    );
    expect(findCachedReply(companyA, "What airport services do you provide?")).toBeUndefined();
  });

  it("never shares cached replies between companies", () => {
    cacheReply(companyA, "What are your hours?", "Open all day.");

    expect(findCachedReply(companyB, "What are your hours?")).toBeUndefined();
  });

  it("does not treat similar routes as the same customer request", () => {
    cacheReply(companyA, "Transfer from Haneda Airport to Shinjuku", "Haneda route reply");

    expect(findCachedReply(companyA, "Transfer from Narita Airport to Shinjuku")).toBeUndefined();
  });
});
