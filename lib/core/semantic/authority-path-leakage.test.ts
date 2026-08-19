// ── Stage 5R.7 — benchmark-leakage guard over the SEMANTIC-AUTHORITY path ───────
// The production modules that decide construct authority must never reference the
// FedEx benchmark, its Gold values/labels, or the eval harness — otherwise a Core
// decision could be (accidentally) tuned to Benchmark 001. Covers the whole path,
// not one or two files. (Eval fixtures under pipeline/fedex-* and semantic/model/*
// legitimately reference the benchmark and are intentionally excluded.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const AUTHORITY_PATH = [
  "lib/core/semantic/authority.ts",
  "lib/core/semantic/metadata.ts",
  "lib/core/semantic/entailment.ts",
  "lib/core/semantic/interpretation.ts",
  "lib/core/semantic/grouping.ts",
  "lib/core/semantic/synthesis.ts",
  "lib/core/semantic/prompts.ts",
  "lib/core/semantic/validate-model-output.ts",
  "lib/core/disconfirmation/assess.ts",
  "lib/core/disconfirmation/types.ts",
  "lib/core/pipeline/analyse.ts",
  "lib/core/assessment/ranking.ts",
  "lib/core/assessment/eligibility.ts",
  "lib/core/assessment/assess.ts",
  "lib/core/candidates/generate.ts",
  "lib/core/candidates/types.ts",
];

// Benchmark-specific tokens that must never appear in the authority path.
const FORBIDDEN: { re: RegExp; label: string }[] = [
  { re: /\bfedex\b/i, label: "FedEx name" },
  { re: /\b(64\.6|55\.8|69\.3)\b/, label: "benchmark grouping value" },
  { re: /intelligence-evals/, label: "eval-harness import" },
  { re: /FEDEX_SOURCE|benchmarks\/fedex/, label: "benchmark source" },
  { re: /strong_fit|relevant_unclear|never_noticed|brand_visibility/, label: "Gold option id" },
  { re: /loadFedexBenchmark|fedexSourceModel|forbidden_groupings|must_not_say/, label: "Gold contract" },
];

for (const file of AUTHORITY_PATH) {
  test(`no benchmark leakage in ${file}`, () => {
    const src = readFileSync(file, "utf8");
    for (const { re, label } of FORBIDDEN) {
      assert.equal(re.test(src), false, `${file} must not reference ${label} (${re})`);
    }
  });
}

test("the authority-path list itself is non-trivial (guards against silent shrinkage)", () => {
  assert.ok(AUTHORITY_PATH.length >= 12);
});
