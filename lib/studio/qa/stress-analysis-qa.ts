// ── Survey Studio — STRESS Analysis regression (QA ONLY, live model, no DB) ───
// Runs the REAL analysis pipeline (analyst pass per batch → deterministic verify →
// projection) against the hard synthetic stress fixture (6 surveys / 13 questions →
// STAGED, 4 batches). Confirms the SAME method handles the large/staged case: breadth
// across batches, governance holds (engineered non-comparable / banned-language traps are
// rejected), and a Study-level narrative is produced. No database writes.
//
//   npx tsx lib/studio/qa/stress-analysis-qa.ts

import { readFileSync } from "node:fs";
import path from "node:path";
import { buildStressStudy, STRESS_OBJECTIVE } from "@/lib/studio/stress-fixture";
import { buildStudyAnalysisEvidence, validateProposals, validateNarrative, validateThemes, dedupeProposals } from "@/lib/studio/study-analysis";
import { batchResultGroups, chooseAnalysisMode } from "@/lib/studio/study-analysis-stage";
import { buildStage1Prompt, buildStage2Prompt } from "@/lib/studio/study-analysis-prompt";
import { completeJSON } from "@/lib/intelligence/openai";

try {
  for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
} catch { /* env may already be present */ }

const MODEL = "gpt-4o";

async function main() {
  const { study, resultGroups } = buildStressStudy();
  const payload = buildStudyAnalysisEvidence({ ...study, objective: STRESS_OBJECTIVE }, resultGroups);
  const mode = chooseAnalysisMode(payload);
  const batched = batchResultGroups(resultGroups);
  if (!batched.ok) throw new Error(batched.error);

  console.log(`\n=== STRESS regression — mode=${mode} · batches=${batched.batches.length} · evidence=${payload.evidence.length} · derived=${payload.derived.length} ===\n`);

  const collected: Awaited<ReturnType<typeof validateProposals>>["valid"] = [];
  let rejected = 0;
  for (let b = 0; b < batched.batches.length; b++) {
    const raw = await completeJSON<unknown>({ prompt: buildStage1Prompt(payload, batched.batches[b], STRESS_OBJECTIVE), model: MODEL, temperature: 0.45, maxTokens: 4000 });
    const v = validateProposals(raw, payload.evidence, payload.derived);
    rejected += v.rejected.length;
    collected.push(...v.valid);
    console.log(`batch ${b + 1}/${batched.batches.length}: ${v.valid.length} valid · ${v.rejected.length} rejected`);
  }
  const valid = dedupeProposals(collected).kept;

  let narrative: { headline: string } | null = null;
  let themes: Awaited<ReturnType<typeof validateThemes>>["themes"] = [];
  try {
    const sraw = await completeJSON<unknown>({ prompt: buildStage2Prompt(payload, valid, STRESS_OBJECTIVE), model: MODEL, temperature: 0.35, maxTokens: 2600 });
    themes = validateThemes(sraw, valid, payload.evidence, payload.derived).themes;
    narrative = validateNarrative(sraw, payload.evidence, payload.derived).narrative;
  } catch { /* optional */ }

  const themedIdx = new Set(themes.flatMap((t) => t.proposalIndexes));
  console.log(`\n=== SUMMARY ===`);
  console.log(`total valid proposals (deduped): ${valid.length} (${valid.filter((p) => p.priority === "key").length} key)`);
  console.log(`themes: ${themes.length} · standalone: ${valid.length - themedIdx.size} · rejected (governance held): ${rejected} · narrative: ${narrative ? "yes" : "no"}`);
  console.log(`\nThemes (hierarchy over ${valid.length} avenues):`);
  for (const t of themes) {
    console.log(`   ▸ [${t.importance}] ${t.title}  (${t.proposalIndexes.length} avenues)`);
    for (const i of t.proposalIndexes) console.log(`         - [${valid[i].displayType}] ${valid[i].headline}`);
  }
  const solo = valid.map((p, i) => ({ p, i })).filter(({ i }) => !themedIdx.has(i));
  if (solo.length) { console.log(`   ○ standalone:`); for (const { p } of solo) console.log(`         - [${p.displayType}] ${p.headline}`); }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
