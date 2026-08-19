// ── Fanometrix Intelligence Evals — OPTIONAL, MANUAL semantic judge ──
//
// The model-assisted (Tier 3) scorer. It judges the things deterministic code
// cannot safely decide: did the analysis EXPRESS each must-find concept (in any
// words), stay within the acceptable interpretations, and avoid the forbidden
// extensions — plus a semantic pass over MUST-NOT-SAY items whose paraphrases a
// lexical check would miss.
//
// IT IS DELIBERATELY NOT A *.test.ts, so `npm test` / CI never runs it. It calls
// OpenAI and must only be run manually:
//
//     npx tsx lib/intelligence-evals/model-judge.ts <path-to-captured-analysis.json> [benchmarkId]
//
// It changes no production behaviour and writes nothing except stdout. Its
// verdicts are ADVISORY inputs to human review, printed alongside the
// deterministic score — never a silent pass/fail. Keep semantic judgement out
// of the deterministic gate on purpose.

import { readFileSync } from "node:fs";
import path from "node:path";
import { loadFedexBenchmark, fedexSourceModel } from "./benchmarks/fedex-ucl-001/benchmark";
import { scoreBenchmark } from "./scoring";
import type { AnalysisUnderTest } from "./capture-contract";
import type { Benchmark } from "./schema";

// Registry of benchmarks the judge understands. Add a line per new benchmark.
const BENCHMARKS: Record<string, () => { benchmark: Benchmark; source: ReturnType<typeof fedexSourceModel> }> = {
  "fedex-ucl-001": () => ({ benchmark: loadFedexBenchmark(), source: fedexSourceModel() }),
};

type MustFindVerdict = {
  id: string;
  expressed: boolean;                 // was the concept expressed at all?
  faithful: boolean;                  // within acceptable interpretations, no over-reach?
  missing_required_caveats: string[]; // caveats the analysis failed to include
  forbidden_extension_hit: boolean;   // did it stray into a forbidden extension?
  evidence: string;                   // the judge's one-line justification (quote/paraphrase)
};

type JudgeResult = {
  must_find: MustFindVerdict[];
  must_not_say_semantic: { id: string; violated: boolean; evidence: string }[];
};

function buildJudgePrompt(analysis: AnalysisUnderTest, benchmark: Benchmark): string {
  const findings = analysis.findings.map((f, i) => `F${i + 1} (rank ${f.rank}): ${f.text}${f.detail ? " — " + f.detail : ""}`).join("\n");
  const narrative = analysis.narrative ? `\nNARRATIVE: ${analysis.narrative.headline ?? ""} ${analysis.narrative.summary ?? ""}` : "";
  const mustFind = benchmark.must_find.map((m) =>
    `- ${m.id}: CONCEPT = ${m.concept}\n    acceptable: ${m.acceptable_interpretations.join(" | ")}\n    required caveats: ${m.required_caveats.join(" | ") || "(none)"}`
  ).join("\n");
  const mustNot = benchmark.must_not_say.filter((r) => r.scoreability === "model-assisted").map((r) => `- ${r.id}: ${r.prohibited_concept} (${r.reason})`).join("\n");

  return [
    "You are a strict research-methodology reviewer scoring an analysis against a human-defined gold standard.",
    "Judge MEANING, not wording — the analysis may use different words. Be conservative: if a concept is not genuinely expressed, mark it not expressed.",
    "",
    `OBJECTIVE STUDY: ${benchmark.source_study}`,
    "",
    "ANALYSIS UNDER TEST:",
    findings + narrative,
    "",
    "MUST-FIND CONCEPTS (did the analysis express each, faithfully, with its required caveats, without over-reaching?):",
    mustFind,
    "",
    "MUST-NOT-SAY (semantic — did the analysis make any of these prohibited claims, in any words?):",
    mustNot || "(none requiring semantic judgement)",
    "",
    "Return ONLY valid JSON matching:",
    '{"must_find":[{"id":"mf-1","expressed":true,"faithful":true,"missing_required_caveats":[],"forbidden_extension_hit":false,"evidence":"..."}],',
    ' "must_not_say_semantic":[{"id":"mns-2","violated":false,"evidence":"..."}]}',
  ].join("\n");
}

function loadEnv() {
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch { /* env may already be present */ }
}

async function main() {
  const capturePath = process.argv[2];
  const benchmarkId = process.argv[3] ?? "fedex-ucl-001";
  if (!capturePath) {
    console.error("usage: npx tsx lib/intelligence-evals/model-judge.ts <captured-analysis.json> [benchmarkId]");
    process.exit(2);
  }
  const make = BENCHMARKS[benchmarkId];
  if (!make) { console.error(`unknown benchmark: ${benchmarkId}. known: ${Object.keys(BENCHMARKS).join(", ")}`); process.exit(2); }
  const { benchmark, source } = make();
  const analysis = JSON.parse(readFileSync(path.resolve(capturePath), "utf8")) as AnalysisUnderTest;

  // Deterministic score first (this is the trustworthy part).
  const det = scoreBenchmark(analysis, benchmark, source);
  console.log("=== DETERMINISTIC SCORE ===");
  console.log(`gate: arithmeticViolations=${det.gate.arithmeticViolations} ungroundedNumbers=${det.gate.ungroundedNumbers} overBudget=${det.gate.overBudget}`);
  for (const d of det.dimensions) console.log(`  [${d.tier}] ${d.dimension}: ${d.status}${d.score != null ? ` score=${d.score.toFixed(2)}` : ""}`);

  // Semantic judge (advisory). Imported lazily so the deterministic path never
  // needs OpenAI.
  loadEnv();
  const { completeJSON } = await import("@/lib/intelligence/openai");
  const verdict = await completeJSON<JudgeResult>({ prompt: buildJudgePrompt(analysis, benchmark), model: "gpt-4o", temperature: 0.1, maxTokens: 1500 });

  console.log("\n=== SEMANTIC JUDGE (ADVISORY — not a gate) ===");
  const expressed = verdict.must_find.filter((v) => v.expressed).length;
  console.log(`must-find expressed: ${expressed}/${benchmark.must_find.length}`);
  for (const v of verdict.must_find) console.log(`  ${v.id}: expressed=${v.expressed} faithful=${v.faithful} forbiddenExt=${v.forbidden_extension_hit} missingCaveats=${v.missing_required_caveats.length} — ${v.evidence}`);
  const violated = verdict.must_not_say_semantic.filter((v) => v.violated);
  console.log(`semantic MUST-NOT-SAY violations: ${violated.length}`);
  for (const v of violated) console.log(`  ${v.id}: ${v.evidence}`);
  console.log("\nNote: semantic verdicts are advisory inputs to human review, not an automated pass/fail.");
}

main().catch((e) => { console.error(e); process.exit(1); });
