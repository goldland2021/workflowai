import { describe, expect, it, vi } from "vitest";

// Deterministic: these are pure helpers; keep the LLM disabled like sibling tests.
vi.mock("../ai/client", () => ({
  hasRealAI: false,
  generateStructured: vi.fn(async () => {
    throw new Error("LLM disabled for deterministic tests.");
  }),
  generateReply: vi.fn(async () => {
    throw new Error("LLM disabled for deterministic tests.");
  }),
}));

import { mergeTripDetails, isBareAcknowledgement } from "./ai-workflow";

// Regression guard for the charterIntent char-class bug: common Chinese messages
// (containing 点/车/多/个/时…) must NOT be misclassified as day_tour, which was
// causing wildly swinging quotes in production.
describe("charterIntent: common Chinese is not day_tour", () => {
  for (const msg of ["能不能便宜一点", "车型阿尔法", "接机时间几点", "有几个人", "地点在哪", "从羽田到银座往返"]) {
    it(`"${msg}" -> serviceType !== day_tour`, () => {
      expect(mergeTripDetails({}, msg, undefined).serviceType).not.toBe("day_tour");
    });
  }
  it("real charter phrase still maps to day_tour", () => {
    expect(mergeTripDetails({}, "我们想包车一日游", undefined).serviceType).toBe("day_tour");
  });
});

// Regression guard for bare-acknowledgement detection (Option A): Chinese acks
// with suffixes / no spaces must be recognized so a quote is not re-surfaced.
describe("isBareAcknowledgement: Chinese suffixed/concatenated acks", () => {
  for (const m of ["好的，谢谢你", "谢谢您", "好的谢谢啦", "好的谢谢", "ok got it, thanks", "谢谢"]) {
    it(`"${m}" is an acknowledgement`, () => expect(isBareAcknowledgement(m)).toBe(true));
  }
  for (const m of ["改到早上7点", "好的司机稍等一下", "能便宜一点吗？", "帮我订车"]) {
    it(`"${m}" is NOT a bare acknowledgement`, () => expect(isBareAcknowledgement(m)).toBe(false));
  }
});
