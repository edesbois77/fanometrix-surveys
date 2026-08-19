// Stage 5 — semantic prompts/rubrics and shadow modules must carry NO benchmark
// or FedEx knowledge (no expected answers). Benchmark material lives only in eval
// fixtures/runners.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PRODUCTION_MODULES = [
  "lib/core/semantic/prompts.ts",
  "lib/core/semantic/validate-model-output.ts",
  "lib/core/semantic/grouping.ts",
  "lib/core/semantic/synthesis.ts",
  "lib/core/semantic/model/judges.ts",
  "lib/core/studio/adapter.ts",
  "lib/core/studio/shadow.ts",
  "lib/core/run/ledger.ts",
  "lib/core/run/fingerprint.ts",
];

test("no benchmark/FedEx knowledge in semantic prompts, shadow or run modules", () => {
  for (const f of PRODUCTION_MODULES) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/fedex|intelligence-evals|benchmarks\/fedex|64\.6|55\.8|69\.3/i.test(src), `${f} must not contain benchmark/FedEx knowledge`);
  }
});
