import { afterAll, describe, expect, it, vi } from "vitest";

// Run the eval suite against the deterministic (rule-based) path so it produces
// a stable baseline in CI. When the orchestrator lands, a parallel run with a
// mocked LLM can reuse the exact same dataset and expectations.
vi.mock("../../ai/client", () => ({
  hasRealAI: false,
  generateStructured: vi.fn(async () => {
    throw new Error("LLM is disabled for deterministic eval baseline.");
  }),
  generateReply: vi.fn(async () => {
    throw new Error("LLM is disabled for deterministic eval baseline.");
  }),
}));

import { analyzeCustomerTurn } from "../ai-workflow";
import { airportTransferConfiguration } from "../airport-transfer";
import { replyLanguageMatches } from "../../ai/reply";
import type { WorkflowResult } from "../workflow-types";
import { conversationEvals, type EvalCase, type EvalExpectation } from "./conversation-evals";

async function runCase(evalCase: EvalCase): Promise<WorkflowResult> {
  return analyzeCustomerTurn({
    message: evalCase.message,
    currentTripDetails: evalCase.currentTripDetails ?? {},
    configuration: airportTransferConfiguration,
    existingBossItems: [],
    recentMessages: evalCase.recentMessages,
    customerLanguage: evalCase.lang,
  });
}

/** Returns the list of failed sub-checks for a case (empty = pass). */
function checkExpectation(result: WorkflowResult, expect: EvalExpectation): string[] {
  const failures: string[] = [];
  const trip = result.tripDetails;
  const eventTypes = result.detectedEvents.map((e) => e.eventType);
  const inboxTypes = result.bossInboxItems.map((i) => i.type);

  if (expect.tripEquals) {
    for (const [key, value] of Object.entries(expect.tripEquals)) {
      if (trip[key as keyof typeof trip] !== value) {
        failures.push(`tripEquals.${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(trip[key as keyof typeof trip])}`);
      }
    }
  }
  for (const key of expect.tripPresent ?? []) {
    const v = trip[key];
    const present = Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "";
    if (!present) failures.push(`tripPresent.${String(key)}: expected a value`);
  }
  for (const key of expect.tripAbsent ?? []) {
    const v = trip[key];
    const present = Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "";
    if (present) failures.push(`tripAbsent.${String(key)}: expected empty, got ${JSON.stringify(v)}`);
  }
  for (const ev of expect.eventsInclude ?? []) {
    if (!eventTypes.includes(ev)) failures.push(`eventsInclude: missing ${ev} (got [${eventTypes.join(", ")}])`);
  }
  for (const ev of expect.eventsExclude ?? []) {
    if (eventTypes.includes(ev)) failures.push(`eventsExclude: unexpected ${ev}`);
  }
  if (expect.quote !== undefined && Boolean(result.quote) !== expect.quote) {
    failures.push(`quote: expected ${expect.quote}, got ${Boolean(result.quote)}`);
  }
  for (const t of expect.bossInboxIncludes ?? []) {
    if (!inboxTypes.includes(t)) failures.push(`bossInboxIncludes: missing ${t} (got [${inboxTypes.join(", ")}])`);
  }
  if (expect.contactCaptured !== undefined && Boolean(result.contact) !== expect.contactCaptured) {
    failures.push(`contactCaptured: expected ${expect.contactCaptured}, got ${Boolean(result.contact)}`);
  }
  if (expect.replyLang) {
    if (!result.aiMessage.text?.trim()) failures.push("replyLang: empty reply");
    else if (!replyLanguageMatches(result.aiMessage.text, expect.replyLang)) {
      failures.push(`replyLang: reply not in ${expect.replyLang} ("${result.aiMessage.text.slice(0, 40)}...")`);
    }
  }
  return failures;
}

type Report = { id: string; mode: string; pass: boolean; about: string; failures: string[] };
const report: Report[] = [];

describe("conversation eval — regression (must pass)", () => {
  for (const c of conversationEvals.filter((c) => c.mode === "regression")) {
    it(`${c.id}: ${c.about}`, async () => {
      const result = await runCase(c);
      const failures = checkExpectation(result, c.expect);
      report.push({ id: c.id, mode: c.mode, pass: failures.length === 0, about: c.about, failures });
      expect(failures, failures.join(" | ")).toEqual([]);
    });
  }
});

describe("conversation eval — aspiration (baseline, non-blocking)", () => {
  for (const c of conversationEvals.filter((c) => c.mode === "aspiration")) {
    // Recorded into the baseline but not asserted, so today's gaps do not fail
    // the build. Flip to `it` (hard assert) as the orchestrator closes each gap.
    it(`[baseline] ${c.id}: ${c.about}`, async () => {
      const result = await runCase(c);
      const failures = checkExpectation(result, c.expect);
      report.push({ id: c.id, mode: c.mode, pass: failures.length === 0, about: c.about, failures });
      // Intentionally not asserting: this run only records the baseline score.
      expect(true).toBe(true);
    });
  }
});

afterAll(() => {
  const regression = report.filter((r) => r.mode === "regression");
  const aspiration = report.filter((r) => r.mode === "aspiration");
  const pct = (rs: Report[]) => (rs.length ? Math.round((rs.filter((r) => r.pass).length / rs.length) * 100) : 0);

  const lines: string[] = [];
  lines.push("");
  lines.push("══════════════ Conversation Eval Baseline ══════════════");
  lines.push(`Regression: ${regression.filter((r) => r.pass).length}/${regression.length} (${pct(regression)}%)`);
  lines.push(`Aspiration: ${aspiration.filter((r) => r.pass).length}/${aspiration.length} (${pct(aspiration)}%)  ← target for the refactor`);
  lines.push("──────────────────────────────────────────────────────");
  for (const r of report) {
    lines.push(`${r.pass ? "✅" : "❌"} [${r.mode.slice(0, 4)}] ${r.id} — ${r.about}`);
    if (!r.pass) for (const f of r.failures) lines.push(`      ↳ ${f}`);
  }
  lines.push("════════════════════════════════════════════════════════");
  // eslint-disable-next-line no-console
  console.log(lines.join("\n"));
});
