#!/usr/bin/env node
// One-command live conversation gate. Sets EVAL_LIVE so the live eval actually
// runs, then invokes vitest. Cross-platform (avoids PowerShell/bash env syntax
// differences). Pass ORCH_DEBUG=1 in your env to also print raw model output.
import { spawnSync } from "node:child_process";

const env = { ...process.env, EVAL_LIVE: "1" };
const result = spawnSync(
  "npx",
  ["vitest", "run", "src/lib/domain/__evals__/conversation-evals.live.test.ts"],
  { stdio: "inherit", env, shell: true },
);
process.exit(result.status ?? 1);
