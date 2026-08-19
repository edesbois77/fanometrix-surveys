// ── Research Reasoner — verified output → product intelligence (ISOLATED shape) ─
// Turns the RAW reasoner output into the product contract the Findings UI renders,
// enforcing three things deterministically:
//   • SOFTEN policy (§10): a claim whose language overreaches its evidence is either
//     RE-TIERED to a lower authority (a stray recommendation becomes a hypothesis) or,
//     when safe softening cannot preserve meaning, DROPPED — never laundered.
//   • Citation resolution (§11): every evidence ref (e1/d1/s1) becomes a human-readable
//     evidence line (question + option + %/base, or the governed fact label). Internal
//     ids never reach the user.
//   • Authority contract (§12): measured / synthesis / interpretation / hypothesis are
//     kept visibly distinct; UNSUPPORTED never appears.
// If the executive story cannot be defended, `displayable=false` and the product falls
// back to the deterministic Findings experience.
import type { ReasonerOutput, InsightType } from "./reasoning-schema";
import type { ReasonerPackage } from "./evidence-package";
import { buildClaimContext, verifyClaimText, type ClaimContext } from "./verifier";

export type AuthorityTier = "measured" | "synthesis" | "interpretation" | "hypothesis";
export type EvidenceLine = { question: string; label: string; percentage: number | null; base: number | null };
export type ProductInsight = {
  id: string; authority: AuthorityTier; takeaway: string; explanation: string;
  whyItMatters: string; confidence: string; caveat: string;
  evidence: EvidenceLine[]; counterEvidence: EvidenceLine[];
  /** The ORIGINAL governed evidence refs this insight was verified against (not the
   *  ephemeral short ids). Persisted so a downstream consumer (Stage C2 Reports) can
   *  freeze the EXACT same governed evidence via the existing selectFindingEvidence path.
   *  Provenance only — never rendered to end users. Absent on pre-C2 artefacts. */
  evidenceRefs: string[]; counterEvidenceRefs: string[];
};
export type ProductIntelligence = {
  displayable: boolean;
  story: { headline: string; summary: string | null } | null;
  keyInsights: ProductInsight[];      // synthesis + interpretation (2-4)
  toConsider: ProductInsight[];       // implications / hypotheses
  observations: { statement: string; evidence: EvidenceLine[] }[];
  tensions: { statement: string; evidence: EvidenceLine[] }[];
  cannotConclude: string[];
  openQuestions: string[];
};
/** Audit record of what the soften/verify policy removed & why. Kept SEPARATE from the
 *  client-facing product so a rejected claim's text (a fabrication) is never shipped to
 *  the browser — it is persisted only in the run's audit. */
export type DroppedClaim = { where: string; reasons: string[] };
export type ShapedResult = { product: ProductIntelligence; dropped: DroppedClaim[] };

// KEY_MAX is a safety CEILING, not a target: the model's own materiality (prompted to
// surface every distinct evidence-supported pattern, never to pad) governs the actual
// count. The ceiling only guards against a runaway list; a thin survey still returns few.
const KEY_MAX = 6, CONSIDER_MAX = 3, OBS_MAX = 4, TENSION_MAX = 3;
const AUTH_OF: Record<InsightType, AuthorityTier> = { synthesis: "synthesis", interpretation: "interpretation", implication: "hypothesis" };

/** Content words for overlap comparison (drop short/common tokens). */
const contentWords = (s: string): Set<string> =>
  new Set((s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3));
const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  const inter = [...a].filter((x) => b.has(x)).length;
  return inter / new Set([...a, ...b]).size;
};
const evidenceLabelSet = (pi: ProductInsight): Set<string> => new Set(pi.evidence.map((e) => e.label));
const isSubset = (a: Set<string>, b: Set<string>): boolean => a.size > 0 && [...a].every((x) => b.has(x));

/** CONSERVATIVE de-duplication: drop a later insight only when it BOTH restates an
 *  earlier one's takeaway (high word overlap) AND rests on a subset of the same evidence.
 *  Distinct patterns cite different evidence, so market/device/question patterns are never
 *  collapsed; only genuine restatements are removed. Keeps the first (stronger-ranked). */
function dedupeInsights(list: ProductInsight[]): ProductInsight[] {
  const kept: ProductInsight[] = [];
  for (const c of list) {
    const cWords = contentWords(c.takeaway);
    const cRefs = evidenceLabelSet(c);
    const dup = kept.some((k) => jaccard(contentWords(k.takeaway), cWords) >= 0.6 && isSubset(cRefs, evidenceLabelSet(k)));
    if (!dup) kept.push(c);
  }
  return kept;
}

function buildRefDisplay(pkg: ReasonerPackage): Map<string, EvidenceLine> {
  const m = new Map<string, EvidenceLine>();
  for (const q of pkg.questions) for (const o of q.options) m.set(o.id, { question: q.text, label: o.label, percentage: o.pct, base: q.base });
  for (const d of pkg.derivedFacts) m.set(d.id, { question: "", label: d.label, percentage: null, base: null });
  for (const s of pkg.segmentFacts) m.set(s.id, { question: "", label: s.label, percentage: null, base: null });
  return m;
}
const resolveLines = (refs: string[], disp: Map<string, EvidenceLine>): EvidenceLine[] =>
  [...new Set(refs)].map((r) => disp.get(r)).filter((x): x is EvidenceLine => !!x);

/** Short citation id (e1/d1/s1) → the ORIGINAL governed ref (e.g. study#..|q#..|opt#..).
 *  The package retains both; this recovers the durable refs the model cited so an accepted
 *  Report finding can freeze exactly the governed evidence the insight was verified against. */
function buildRefIndex(pkg: ReasonerPackage): Map<string, string> {
  const m = new Map<string, string>();
  for (const q of pkg.questions) for (const o of q.options) m.set(o.id, o.ref);
  for (const d of pkg.derivedFacts) m.set(d.id, d.ref);
  for (const s of pkg.segmentFacts) m.set(s.id, s.ref);
  return m;
}
const resolveRefs = (refs: string[], idx: Map<string, string>): string[] =>
  [...new Set(refs)].map((r) => idx.get(r)).filter((x): x is string => !!x);

/** Was the ONLY problem a stray recommendation? Then it is safe to re-tier to a
 *  hypothesis rather than drop it (authority-matching). Any harder overreach (causal,
 *  significance, respondent-level, cross-question, fabricated number) is NOT re-tierable. */
const prescriptionOnly = (reasons: string[]) => reasons.length > 0 && reasons.every((r) => /prescriptive recommendation/i.test(r));

export function shapeIntelligence(out: ReasonerOutput, pkg: ReasonerPackage, ctxInput: { validRefs: Set<string>; numbersByRef: Map<string, number[]>; groupedShareRefs: Set<string>; refToQuestion: Map<string, string> }): ShapedResult {
  const ctx: ClaimContext = buildClaimContext(ctxInput);
  const disp = buildRefDisplay(pkg);
  const refIdx = buildRefIndex(pkg);
  const dropped: DroppedClaim[] = [];

  // ── Executive story: the headline must be defensible on its own. ──────────────
  const headline = out.executiveStory?.headline ?? "";
  const summary = out.executiveStory?.summary ?? "";
  // The headline must be fully clean (PASS) to display the reasoned experience — a soft
  // (banned-language) or fabricated headline is never shown raw; the product falls back to
  // the deterministic experience instead. The summary is kept only if it too is clean.
  const hv = verifyClaimText(ctx, headline, out.executiveStory?.evidenceRefs ?? [], { requireRefs: false });
  let story: ProductIntelligence["story"] = null;
  if (hv.verdict !== "PASS") {
    dropped.push({ where: "executiveStory (headline)", reasons: hv.reasons });
  } else {
    const sv = verifyClaimText(ctx, summary, out.executiveStory?.evidenceRefs ?? [], { requireRefs: true });
    story = { headline, summary: sv.verdict === "PASS" ? summary : null };
    if (sv.verdict !== "PASS") dropped.push({ where: "executiveStory (summary)", reasons: sv.reasons });
  }
  const displayable = story !== null;

  // ── Insights → key insights (synthesis/interpretation) or "to consider" (implication) ──
  const keyInsights: ProductInsight[] = [];
  const toConsider: ProductInsight[] = [];
  for (const i of out.insights ?? []) {
    const refs = [...(i.evidenceRefs ?? []), ...(i.counterEvidenceRefs ?? [])];
    const text = `${i.title}. ${i.statement} ${i.whyItMatters} ${i.caveat}`;
    const v = verifyClaimText(ctx, text, refs, { requireRefs: true, type: i.type });
    let type = i.type;
    if (v.verdict === "REJECT") { dropped.push({ where: `insight:${i.id}`, reasons: v.reasons }); continue; }
    if (v.verdict === "SOFTEN") {
      if (prescriptionOnly(v.reasons) && i.type !== "implication") type = "implication"; // re-tier, don't launder
      else { dropped.push({ where: `insight:${i.id}`, reasons: v.reasons }); continue; }
    }
    // whyItMatters authority boundary: it is a subordinate RATIONALE, bounded to
    // INTERPRETATION — never a recommendation and never an unsupported causal/behavioural
    // outcome dressed as a finding. Re-check it ALONE through the SAME firewall (no new
    // detector): if it trips prescription / overreach / a fabricated number, WITHHOLD just
    // the rationale (the clean insight stays at its proper tier) rather than let a
    // recommendation ride along as if it were measured. A whyItMatters the firewall already
    // accepts (as today's live output does) is kept verbatim, so this cannot regress it.
    let whyItMatters = i.whyItMatters ?? "";
    if (whyItMatters.trim()) {
      const wv = verifyClaimText(ctx, whyItMatters, refs, { requireRefs: false, type: i.type });
      if (wv.verdict !== "PASS") { dropped.push({ where: `insight:${i.id}:whyItMatters`, reasons: wv.reasons }); whyItMatters = ""; }
    }
    const pi: ProductInsight = {
      id: i.id, authority: AUTH_OF[type], takeaway: i.title, explanation: i.statement,
      whyItMatters, confidence: i.confidence, caveat: i.caveat,
      evidence: resolveLines(i.evidenceRefs ?? [], disp), counterEvidence: resolveLines(i.counterEvidenceRefs ?? [], disp),
      evidenceRefs: resolveRefs(i.evidenceRefs ?? [], refIdx), counterEvidenceRefs: resolveRefs(i.counterEvidenceRefs ?? [], refIdx),
    };
    (type === "implication" ? toConsider : keyInsights).push(pi);
  }

  // ── Measured observations + tensions: keep only clean ones. ───────────────────
  const observations: ProductIntelligence["observations"] = [];
  (out.supportingObservations ?? []).forEach((o, k) => {
    const v = verifyClaimText(ctx, o.statement, o.evidenceRefs ?? [], { requireRefs: true });
    if (v.verdict === "PASS") observations.push({ statement: o.statement, evidence: resolveLines(o.evidenceRefs ?? [], disp) });
    else dropped.push({ where: `observation#${k}`, reasons: v.reasons });
  });
  const tensions: ProductIntelligence["tensions"] = [];
  (out.tensions ?? []).forEach((t, k) => {
    const v = verifyClaimText(ctx, t.statement, t.evidenceRefs ?? [], { requireRefs: true });
    if (v.verdict === "PASS") tensions.push({ statement: t.statement, evidence: resolveLines(t.evidenceRefs ?? [], disp) });
    else dropped.push({ where: `tension#${k}`, reasons: v.reasons });
  });

  return {
    product: {
      displayable,
      story,
      keyInsights: dedupeInsights(keyInsights).slice(0, KEY_MAX),
      toConsider: dedupeInsights(toConsider).slice(0, CONSIDER_MAX),
      observations: observations.slice(0, OBS_MAX),
      tensions: tensions.slice(0, TENSION_MAX),
      cannotConclude: (out.cannotConclude ?? []).slice(0, 6),
      openQuestions: (out.openQuestions ?? []).slice(0, 6),
    },
    dropped,
  };
}
