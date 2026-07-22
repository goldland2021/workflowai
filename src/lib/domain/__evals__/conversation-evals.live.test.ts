import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * LIVE conversation eval — runs the REAL pipeline against a REAL LLM.
 *
 * Unlike conversation-evals.test.ts (which mocks the model for a deterministic
 * CI baseline), this file:
 *   - loads .env.local so your DEEPSEEK_API_KEY / LLM_MODEL_* are available,
 *   - turns the orchestrator ON,
 *   - calls the actual analyzeCustomerTurn (network calls to your model),
 *   - prints the same scoreboard so you can compare against the mocked 7/15.
 *
 * It is SKIPPED unless EVAL_LIVE=1, so normal `npm test` never hits the network.
 *
 * Run it (PowerShell, from ai-employee-app):
 *   $env:EVAL_LIVE=1; npx vitest run src/lib/domain/__evals__/conversation-evals.live.test.ts
 */

const LIVE = process.env.EVAL_LIVE === "1";

function loadEnvLocal(): void {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const raw of fs.readFileSync(full, "utf-8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

describe.skipIf(!LIVE)("LIVE conversation eval (real model, orchestrator on)", () => {
  it(
    "scores the dataset against the real LLM",
    async () => {
      // 1) Load secrets/config BEFORE importing modules that read process.env at load time.
      loadEnvLocal();
      process.env.AI_ORCHESTRATOR_ENABLED = "true";

      // 2) Dynamic imports so client.ts reads the freshly-loaded env.
      const { analyzeCustomerTurn } = await import("../ai-workflow");
      const { airportTransferConfiguration } = await import("../airport-transfer");
      const { replyLanguageMatches } = await import("../../ai/reply");
      const { hasRealAI } = await import("../../ai/client");
      const { conversationEvals } = await import("./conversation-evals");

      if (!hasRealAI) {
        // eslint-disable-next-line no-console
        console.log("\n[LIVE eval] No LLM key found in env/.env.local — cannot run a live eval. Aborting cleanly.\n");
        return;
      }

      type Row = { id: string; mode: string; pass: boolean; about: string; failures: string[] };
      const report: Row[] = [];

      for (const c of conversationEvals) {
        const result = await analyzeCustomerTurn({
          message: c.message,
          currentTripDetails: c.currentTripDetails ?? {},
          configuration: airportTransferConfiguration,
          existingBossItems: [],
          recentMessages: c.recentMessages,
          customerLanguage: c.lang,
        });

        const trip = result.tripDetails;
        const eventTypes = result.detectedEvents.map((e) => e.eventType);
        const inboxTypes = result.bossInboxItems.map((i) => i.type);
        const e = c.expect;
        const failures: string[] = [];

        for (const [k, v] of Object.entries(e.tripEquals ?? {})) {
          if (trip[k as keyof typeof trip] !== v) failures.push(`tripEquals.${k}: want ${JSON.stringify(v)}, got ${JSON.stringify(trip[k as keyof typeof trip])}`);
        }
        for (const k of e.tripPresent ?? []) {
          const val = trip[k];
          const present = Array.isArray(val) ? val.length > 0 : val !== undefined && val !== null && val !== "";
          if (!present) failures.push(`tripPresent.${String(k)}: missing`);
        }
        for (const k of e.tripAbsent ?? []) {
          const val = trip[k];
          const present = Array.isArray(val) ? val.length > 0 : val !== undefined && val !== null && val !== "";
          if (present) failures.push(`tripAbsent.${String(k)}: should be empty`);
        }
        for (const ev of e.eventsInclude ?? []) if (!eventTypes.includes(ev)) failures.push(`eventsInclude: missing ${ev}`);
        for (const ev of e.eventsExclude ?? []) if (eventTypes.includes(ev)) failures.push(`eventsExclude: unexpected ${ev}`);
        if (e.quote !== undefined && Boolean(result.quote) !== e.quote) failures.push(`quote: want ${e.quote}, got ${Boolean(result.quote)}`);
        for (const t of e.bossInboxIncludes ?? []) if (!inboxTypes.includes(t)) failures.push(`bossInboxIncludes: missing ${t}`);
        if (e.contactCaptured !== undefined && Boolean(result.contact) !== e.contactCaptured) failures.push(`contactCaptured: want ${e.contactCaptured}, got ${Boolean(result.contact)}`);
        if (e.replyLang) {
          if (!result.aiMessage.text?.trim()) failures.push("replyLang: empty reply");
          else if (!replyLanguageMatches(result.aiMessage.text, e.replyLang)) failures.push(`replyLang: not ${e.replyLang} ("${result.aiMessage.text.slice(0, 40)}...")`);
        }

        report.push({ id: c.id, mode: c.mode, pass: failures.length === 0, about: c.about, failures });
      }

      const reg = report.filter((r) => r.mode === "regression");
      const asp = report.filter((r) => r.mode === "aspiration");
      const pct = (rs: Row[]) => (rs.length ? Math.round((rs.filter((r) => r.pass).length / rs.length) * 100) : 0);
      const lines: string[] = [];
      lines.push("");
      lines.push("═══════════ LIVE Conversation Eval (real model, orchestrator ON) ═══════════");
      lines.push(`Regression: ${reg.filter((r) => r.pass).length}/${reg.length} (${pct(reg)}%)`);
      lines.push(`Aspiration: ${asp.filter((r) => r.pass).length}/${asp.length} (${pct(asp)}%)   vs mocked baseline 7/15`);
      lines.push("───────────────────────────────────────────────────────────────────────────");
      for (const r of report) {
        lines.push(`${r.pass ? "✅" : "❌"} [${r.mode.slice(0, 4)}] ${r.id} — ${r.about}`);
        for (const f of r.failures) lines.push(`      ↳ ${f}`);
      }
      lines.push("═══════════════════════════════════════════════════════════════════════════");
      // eslint-disable-next-line no-console
      console.log(lines.join("\n"));

      // ── Gate: fail the run if the orchestrator regresses ──────────────────
      // Regression cases must ALL pass. Aspiration is LLM-stochastic, so gate on
      // a threshold (leave a small buffer) rather than each individual case.
      const ASPIRATION_MIN = 13;
      const regressionFailures = report.filter((r) => r.mode === "regression" && !r.pass).map((r) => r.id);
      const aspirationPassing = report.filter((r) => r.mode === "aspiration" && r.pass).length;
      const aspirationTotal = report.filter((r) => r.mode === "aspiration").length;
      expect(regressionFailures, `regression must all pass; failing: ${regressionFailures.join(", ")}`).toEqual([]);
      expect(
        aspirationPassing,
        `aspiration ${aspirationPassing}/${aspirationTotal}; gate requires >= ${ASPIRATION_MIN}`,
      ).toBeGreaterThanOrEqual(ASPIRATION_MIN);
    },
    300_000,
  );
});
