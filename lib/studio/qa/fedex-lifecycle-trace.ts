// ── Survey Studio — FedEx analyst LIFECYCLE TRACE (QA ONLY, diagnostic) ───────
// Proves WHERE the analytical set narrows: generated → validated (accept/reject+reason)
// → deduped → final. Runs the REAL analyst pass N times against the hermetic FedEx
// fixture. No DB writes, no chain-of-thought (structured artifact lifecycle only).
//
//   npx tsx lib/studio/qa/fedex-lifecycle-trace.ts [runs]

import { readFileSync } from "node:fs";
import path from "node:path";
import { buildFedexStudy, FEDEX_OBJECTIVE } from "./fedex-fixture";
import { buildStudyAnalysisEvidence, validateProposals, dedupeProposals } from "@/lib/studio/study-analysis";
import { batchResultGroups } from "@/lib/studio/study-analysis-stage";
import { buildStage1Prompt } from "@/lib/studio/study-analysis-prompt";
import { completeJSON } from "@/lib/intelligence/openai";

try {
  for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
} catch { /* env may already be present */ }

const RUNS = Math.max(1, Math.min(8, Number(process.argv[2] ?? 5)));
const MODEL = "gpt-4o";

async function main() {
  const { study, resultGroups } = buildFedexStudy();
  const payload = buildStudyAnalysisEvidence(study, resultGroups);
  const batched = batchResultGroups(resultGroups);
  if (!batched.ok) throw new Error(batched.error);

  console.log(`\n=== FedEx analyst LIFECYCLE TRACE — ${RUNS} runs · ${batched.batches.length} batch(es) · derived ${payload.derived.length} ===\n`);
  const rows: { gen: number; valid: number; govReject: number; dupReject: number; final: number; kinds: Record<string, number> }[] = [];

  const PASSES = batched.batches.length <= 2 ? 2 : 1; // mirror production coverage determinism
  for (let r = 1; r <= RUNS; r++) {
    // ANALYST pass(es) — capture the RAW generated set, then UNION distinct across passes.
    let generated = 0, govReject = 0;
    const collected: { headline: string; displayType: string }[] = [];
    for (const batch of batched.batches) {
      for (let pass = 1; pass <= PASSES; pass++) {
        const raw = await completeJSON<{ proposals?: unknown[] }>({ prompt: buildStage1Prompt(payload, batch, FEDEX_OBJECTIVE), model: MODEL, temperature: 0.45, maxTokens: 4000 });
        generated += Array.isArray(raw?.proposals) ? raw.proposals.length : 0;
        const { valid, rejected } = validateProposals(raw, payload.evidence, payload.derived);
        for (const rej of rejected) {
          if (!rej.reasons.some((x) => /duplicate/.test(x))) { govReject++; console.log(`   ✗ REJECTED [${rej.proposal.displayType ?? rej.proposal.type}] "${rej.proposal.headline}" → ${rej.reasons.join("; ")}`); }
        }
        for (const v of valid) collected.push({ headline: v.headline, displayType: v.displayType });
      }
    }
    // Cross-pass union dedupe (exact + near-identical restatement — mirrors production).
    const collectedProps = collected.map((c) => ({ type: "observation" as const, displayType: c.displayType as never, priority: "key" as const, headline: c.headline, explanation: "", evidenceRefs: [] }));
    const { kept, dropped } = dedupeProposals(collectedProps);
    const dupReject = dropped.length;
    const finalSet = kept;
    const kinds: Record<string, number> = {};
    for (const p of finalSet) kinds[p.displayType] = (kinds[p.displayType] ?? 0) + 1;
    rows.push({ gen: generated, valid: finalSet.length, govReject, dupReject, final: finalSet.length, kinds });
    console.log(`RUN ${r}: generated ${generated} (${PASSES} pass) → gov-rejected ${govReject}, union-dup-dropped ${dupReject} → FINAL ${finalSet.length}`);
    console.log(`   kinds: ${JSON.stringify(kinds)}`);
    for (const p of finalSet) console.log(`     • [${p.displayType}] ${p.headline}`);
    console.log("");
  }

  const col = (f: (x: typeof rows[number]) => number) => rows.map(f);
  const stats = (xs: number[]) => `min ${Math.min(...xs)} · avg ${Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10} · max ${Math.max(...xs)}`;
  console.log("=== WHERE DOES IT NARROW? ===");
  console.log(`generated (analyst raw): ${stats(col((x) => x.gen))}`);
  console.log(`final    (persisted)   : ${stats(col((x) => x.final))}`);
  console.log(`lost to governance     : ${stats(col((x) => x.govReject))}`);
  console.log(`lost to dedupe         : ${stats(col((x) => x.dupReject))}`);
  console.log(`\nInterpretation: if generated ≈ final and both vary run-to-run, the narrowing is at GENERATION (analyst coverage variance), not downstream filtering.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
