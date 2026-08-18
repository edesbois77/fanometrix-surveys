// ── Survey Studio — FedEx Analysis CAPABILITY QA + CONTROL harness (QA ONLY) ──
// Runs the REAL production analysis pipeline (analyst pass → deterministic verify →
// projection) against the hermetic FedEx fixture, N times, using the REAL OpenAI
// completion. It NEVER touches the database and NEVER writes production data — it calls
// the pure prompt/validator functions directly (not analyseStudy, which persists).
//
// It also runs a minimally-constrained CONTROL call on the same evidence to benchmark the
// breadth ceiling (Phase G) — the number of distinct legitimate avenues an unconstrained
// analyst surfaces — so we can see whether the governed pipeline now approaches it.
//
// Run:  OPENAI loaded from .env.local automatically.
//   npx tsx lib/studio/qa/fedex-analysis-qa.ts [runs]
//
// NOT imported by any production path; not a *.test.ts (so `npm test` ignores it).

import { readFileSync } from "node:fs";
import path from "node:path";
import { buildFedexStudy, buildFedexSegments, FEDEX_OBJECTIVE } from "./fedex-fixture";
import { buildStudyAnalysisEvidence, validateProposals, validateNarrative, validateThemes, dedupeProposals, type StudyAnalysisEvidence } from "@/lib/studio/study-analysis";
import { buildSegmentDerived } from "@/lib/studio/study-segments";
import { batchResultGroups } from "@/lib/studio/study-analysis-stage";
import { buildStage1Prompt, buildStage2Prompt } from "@/lib/studio/study-analysis-prompt";
import { completeJSON } from "@/lib/intelligence/openai";

// ── env (tsx does not auto-load .env.local) ──────────────────────────────────
try {
  const envPath = path.join(process.cwd(), ".env.local");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
} catch { /* env may already be present */ }

const RUNS = Math.max(1, Math.min(5, Number(process.argv[2] ?? 3)));
const MODEL = "gpt-4o";

function plainEvidenceBlock(payload: StudyAnalysisEvidence): string {
  const base = payload.evidence.map((e, i) => `e${i + 1}. [${e.scope === "combined" ? "combined" : e.surveyName}] ${e.question} — ${e.optionLabel}: ${e.percentage == null ? "—" : Math.round(e.percentage * 1000) / 10 + "%"} (${e.count}/${e.base})`).join("\n");
  const derived = payload.derived.map((d, i) => `d${i + 1}. ${d.label}`).join("\n");
  return `RESULTS (governed statistics):\n${base}\n\nCOMPUTED FACTS:\n${derived}`;
}

// ── ONE governed pipeline run (real prompts + real validators + real OpenAI) ──
async function runGoverned(payload: StudyAnalysisEvidence) {
  const allDerived = [...payload.derived, ...payload.segmentDerived]; // segment facts are citable
  const batched = batchResultGroups(buildFedexStudy().resultGroups);
  if (!batched.ok) throw new Error(batched.error);
  const analystPasses = batched.batches.length <= 2 ? 2 : 1; // mirror production coverage determinism
  const collected: Awaited<ReturnType<typeof validateProposals>>["valid"] = [];
  let rejectedCount = 0;
  for (const batch of batched.batches) {
    for (let pass = 1; pass <= analystPasses; pass++) {
      const raw = await completeJSON<unknown>({ prompt: buildStage1Prompt(payload, batch, FEDEX_OBJECTIVE), model: MODEL, temperature: 0.45, maxTokens: 4000 });
      const v = validateProposals(raw, payload.evidence, allDerived);
      rejectedCount += v.rejected.length;
      collected.push(...v.valid);
    }
  }
  const valid = dedupeProposals(collected).kept;
  let narrative: { headline: string; summary: string } | null = null;
  let themes: Awaited<ReturnType<typeof validateThemes>>["themes"] = [];
  try {
    const sraw = await completeJSON<unknown>({ prompt: buildStage2Prompt(payload, valid, FEDEX_OBJECTIVE), model: MODEL, temperature: 0.35, maxTokens: 2200 });
    themes = validateThemes(sraw, valid, payload.evidence, allDerived).themes;
    narrative = validateNarrative(sraw, payload.evidence, allDerived).narrative;
  } catch { /* narrative/themes optional */ }
  return { valid, rejectedCount, narrative, themes, batchCount: batched.batches.length };
}

// ── CONTROL: minimally-constrained breadth benchmark (Phase G) ───────────────
async function runControl(payload: StudyAnalysisEvidence): Promise<number> {
  const prompt = `You are a senior brand-research analyst. Below are the governed results of a 2-survey study for FedEx (UEFA Champions League sponsorship).\n\nOBJECTIVE: ${FEDEX_OBJECTIVE}\n\n${plainEvidenceBlock(payload)}\n\nBrainstorm as MANY distinct, legitimate analytical avenues as you honestly can from THIS evidence — observations, contrasts between the two surveys, patterns across the three questions, notable minorities, tensions, and implications for FedEx's activation. Do not invent numbers. Return ONLY JSON: {"avenues":[{"headline":"...","note":"..."}]}`;
  const raw = await completeJSON<{ avenues?: unknown[] }>({ prompt, model: MODEL, temperature: 0.6, maxTokens: 4000 });
  return Array.isArray(raw?.avenues) ? raw.avenues.length : 0;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const { study, resultGroups } = buildFedexStudy();
  const segmentDerived = buildSegmentDerived(study.id, buildFedexSegments());
  const payload = buildStudyAnalysisEvidence(study, resultGroups, segmentDerived);
  const segRefs = new Set(segmentDerived.map((s) => s.ref));

  console.log(`\n=== FedEx Analysis + AUDIENCE QA — ${RUNS} governed runs + 1 control ===`);
  console.log(`base evidence: ${payload.evidence.length} · derived: ${payload.derived.length} · AUDIENCE facts: ${payload.segmentDerived.length}\n`);
  for (const s of segmentDerived) console.log(`   audience: [${s.kind}] ${s.label}`);
  console.log("");

  const leak = (s: string) => /(?:id|ref)s?\s*[:=]\s*e\d+|\[\s*"?e\d+|\bstudy#|evidenceRefs/i.test(s);
  const sawGermany = (s?: string) => !!s && /germany/i.test(s);
  const governed: { proposals: number; themes: number; standalone: number; rejected: number; hasNarrative: boolean; refLeak: boolean; audienceAvenues: number; germanyStory: boolean }[] = [];
  for (let r = 1; r <= RUNS; r++) {
    const out = await runGoverned(payload);
    const themedIdx = new Set(out.themes.flatMap((t) => t.proposalIndexes));
    const standalone = out.valid.length - themedIdx.size;
    const audienceAvenues = out.valid.filter((p) => p.evidenceRefs.some((ref) => segRefs.has(ref))).length;
    const germanyStory = out.valid.some((p) => sawGermany(p.headline) || sawGermany(p.explanation)) || out.themes.some((t) => sawGermany(t.title) || sawGermany(t.interpretation)) || sawGermany(out.narrative?.summary);
    const proseLeak = [out.narrative?.headline, out.narrative?.summary, ...out.themes.flatMap((t) => [t.title, t.interpretation, t.relationToObjective])].some((s) => !!s && leak(s));
    governed.push({ proposals: out.valid.length, themes: out.themes.length, standalone, rejected: out.rejectedCount, hasNarrative: !!out.narrative, refLeak: proseLeak, audienceAvenues, germanyStory });
    console.log(`RUN ${r}: ${out.valid.length} avenues (${audienceAvenues} audience) → ${out.themes.length} themes + ${standalone} standalone · rejected ${out.rejectedCount} · narrative ${out.narrative ? "yes" : "no"} · Germany-story ${germanyStory ? "YES" : "no"} · refLeak ${proseLeak ? "YES!" : "no"}`);
    for (const t of out.themes) {
      console.log(`   ▸ [${t.importance}] ${t.title}  (${t.proposalIndexes.length} avenues)`);
      console.log(`       ${t.interpretation}`);
      for (const i of t.proposalIndexes) console.log(`         - [${out.valid[i].displayType}]${out.valid[i].evidenceRefs.some((ref) => segRefs.has(ref)) ? "🌍" : ""} ${out.valid[i].headline}`);
    }
    const solo = out.valid.map((p, i) => ({ p, i })).filter(({ i }) => !themedIdx.has(i));
    if (solo.length) { console.log(`   ○ standalone:`); for (const { p } of solo) console.log(`         - [${p.displayType}]${p.evidenceRefs.some((ref) => segRefs.has(ref)) ? "🌍" : ""} ${p.headline}`); }
    if (out.narrative) { console.log(`   NARRATIVE › ${out.narrative.headline}`); console.log(`     ${out.narrative.summary}`); }
    console.log("");
  }

  const control = await runControl(payload);
  const avg = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
  console.log("=== SUMMARY ===");
  console.log(`avenues/run : min ${Math.min(...governed.map((g) => g.proposals))} · avg ${avg(governed.map((g) => g.proposals))} · max ${Math.max(...governed.map((g) => g.proposals))}`);
  console.log(`themes/run  : min ${Math.min(...governed.map((g) => g.themes))} · avg ${avg(governed.map((g) => g.themes))} · max ${Math.max(...governed.map((g) => g.themes))}`);
  console.log(`standalone/run: avg ${avg(governed.map((g) => g.standalone))}`);
  console.log(`AUDIENCE avenues/run: min ${Math.min(...governed.map((g) => g.audienceAvenues))} · avg ${avg(governed.map((g) => g.audienceAvenues))} · max ${Math.max(...governed.map((g) => g.audienceAvenues))}`);
  console.log(`Germany recognition-weakness surfaced: ${governed.filter((g) => g.germanyStory).length}/${governed.length} runs`);
  console.log(`narrative present every run: ${governed.every((g) => g.hasNarrative)}`);
  console.log(`ref leak in ANY prose: ${governed.some((g) => g.refLeak) ? "YES — BUG" : "none"}`);
  console.log(`CONTROL (unconstrained breadth ceiling): ${control} avenues`);
  console.log(`\nGovernance held: proposals + themes cite only governed refs (validator-enforced); rejected total ${governed.reduce((a, g) => a + g.rejected, 0)}.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
