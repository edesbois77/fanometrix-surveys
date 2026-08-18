// ── Survey Studio — Study Finding domain (pure) ──────────────────────────────
// The durable, human-owned research layer above Analysis. A Finding is editorial
// (headline + commentary); its EVIDENCE is factual, COPIED + FROZEN at creation, and
// immutable thereafter. This module is pure: no DB, no LLM, no Results maths. It
// validates input, selects/dedupes/orders evidence from an immutable snapshot, and
// governs status/publication rules. Persistence + resolution live in the service.

import type { EvidenceItem } from "@/lib/studio/study-analysis";
import type { DerivedEvidenceItem } from "@/lib/studio/study-derived-evidence";
import type { SegmentDerivedItem } from "@/lib/studio/study-segments";

// ── Frozen evidence contract (base | derived | segment) ──────────────────────
// A Finding must be able to freeze EVERY class of governed evidence Analysis is
// allowed to attach to a proposal — not just base statistics. A frozen item is one
// of three governed classes, COPIED VERBATIM from the immutable Analysis-run snapshot
// at Finding creation (never recomputed). `evidenceClass` tags NEW rows; historical
// rows (written before derived/segment were freezable) carry no tag and are base.
export type EvidenceClass = "base" | "derived" | "segment";
export type FrozenEvidence =
  | ({ evidenceClass: "base" } & EvidenceItem)
  | ({ evidenceClass: "derived" } & DerivedEvidenceItem)
  | ({ evidenceClass: "segment" } & SegmentDerivedItem);

/** Classify a stored (possibly historical/untagged) frozen snapshot. Untagged ⇒ base
 *  (the only class that existed before this contract); tags are authoritative. */
export function evidenceClassOf(e: Record<string, unknown>): EvidenceClass {
  const tag = e.evidenceClass;
  if (tag === "derived" || tag === "segment" || tag === "base") return tag;
  if (typeof e.dimension === "string" && e.dimension) return "segment";
  if (typeof e.optionLabel === "string") return "base";
  if (typeof e.label === "string" && typeof e.kind === "string") return "derived";
  return "base";
}

export type FindingStatus = "draft" | "published";
export type FindingOrigin = "manual" | "analysis_proposal";
export const FINDING_STATUS: FindingStatus[] = ["draft", "published"];

const HEADLINE_MAX = 200;
const COMMENTARY_MAX = 4000;

const norm = (s: unknown) => (typeof s === "string" ? s.trim() : "");

/** Editorial input validation (headline required; bounded lengths). */
export function validateFindingEditorial(input: { headline?: unknown; commentary?: unknown }): { ok: boolean; headline: string; commentary: string | null; error?: string } {
  const headline = norm(input.headline);
  const commentary = norm(input.commentary);
  if (!headline) return { ok: false, headline, commentary: commentary || null, error: "A headline is required." };
  if (headline.length > HEADLINE_MAX) return { ok: false, headline, commentary: commentary || null, error: `Headline too long (${headline.length}>${HEADLINE_MAX}).` };
  if (commentary.length > COMMENTARY_MAX) return { ok: false, headline, commentary, error: `Commentary too long (${commentary.length}>${COMMENTARY_MAX}).` };
  return { ok: true, headline, commentary: commentary || null };
}

/**
 * Select evidence for a Finding from an immutable evidence snapshot, by ref.
 * Dedupe within the Finding (first occurrence wins), preserve order, fail closed on
 * any ref that isn't present in the snapshot (never fabricate/substitute). The caller
 * copies the returned items verbatim into study_finding_evidence with position = index.
 */
export function selectEvidenceByRefs(refs: string[], snapshotEvidence: EvidenceItem[]): { ok: boolean; evidence: EvidenceItem[]; missing: string[]; duplicates: string[] } {
  const byRef = new Map(snapshotEvidence.map((e) => [e.ref, e]));
  const seen = new Set<string>();
  const evidence: EvidenceItem[] = [];
  const missing: string[] = [];
  const duplicates: string[] = [];
  for (const raw of refs) {
    const r = norm(raw);
    if (!r) continue;
    if (seen.has(r)) { duplicates.push(r); continue; }
    seen.add(r);
    const item = byRef.get(r);
    if (!item) missing.push(r);
    else evidence.push(item);
  }
  return { ok: missing.length === 0 && evidence.length > 0, evidence, missing, duplicates };
}

/**
 * UNIFIED resolver — resolves EVERY governed evidence class Analysis may attach to a
 * proposal (base + deterministic derived + governed segment) against the run's IMMUTABLE
 * snapshot, and freezes each item VERBATIM (tagged with its class). Fails closed on any
 * unresolved/malformed ref (never fabricate, never silently drop). Dedupes within the
 * Finding, preserves order. NOTHING is recomputed — the snapshot is the source of truth.
 */
export function selectFindingEvidence(
  refs: string[],
  snapshot: { evidence?: EvidenceItem[]; derived?: DerivedEvidenceItem[]; segmentDerived?: SegmentDerivedItem[] } | null | undefined,
): { ok: boolean; evidence: FrozenEvidence[]; missing: string[]; duplicates: string[] } {
  const byRef = new Map<string, FrozenEvidence>();
  for (const e of snapshot?.evidence ?? []) if (e?.ref && !byRef.has(e.ref)) byRef.set(e.ref, { evidenceClass: "base", ...e });
  for (const d of snapshot?.derived ?? []) if (d?.ref && !byRef.has(d.ref)) byRef.set(d.ref, { evidenceClass: "derived", ...d });
  for (const s of snapshot?.segmentDerived ?? []) if (s?.ref && !byRef.has(s.ref)) byRef.set(s.ref, { evidenceClass: "segment", ...s });
  const seen = new Set<string>();
  const evidence: FrozenEvidence[] = [];
  const missing: string[] = [];
  const duplicates: string[] = [];
  for (const raw of refs) {
    const r = norm(raw);
    if (!r) continue;
    if (seen.has(r)) { duplicates.push(r); continue; }
    seen.add(r);
    const item = byRef.get(r);
    if (!item) missing.push(r);
    else evidence.push(item);
  }
  return { ok: missing.length === 0 && evidence.length > 0, evidence, missing, duplicates };
}

/** Publication precondition: a draft with a headline and ≥1 evidence item. */
export function assertPublishable(finding: { status: string; headline: string }, evidenceCount: number): { ok: boolean; error?: string } {
  if (finding.status !== "draft") return { ok: false, error: "Only a draft finding can be published." };
  if (!norm(finding.headline)) return { ok: false, error: "A headline is required to publish." };
  if (evidenceCount < 1) return { ok: false, error: "A finding needs at least one evidence item to publish." };
  return { ok: true };
}

/** Invariant used by tests + guards: draft ⇒ no publication stamps; published ⇒ both. */
export function publicationStateValid(f: { status: string; published_at: unknown; published_by: unknown }): boolean {
  if (f.status === "draft") return f.published_at == null && f.published_by == null;
  if (f.status === "published") return f.published_at != null && f.published_by != null;
  return false;
}

// ── Projections (for API/UI; never a source of truth for numbers) ────────────
// One view covers all three classes. Base carries the structured statistic; derived and
// segment carry a governed, human-readable `label` (the deterministic fact sentence) and
// leave the base numeric fields null. `label` is always present so the UI can render any
// class intelligibly without exposing refs.
export type EvidenceView = {
  position: number; ref: string; evidenceClass: EvidenceClass;
  question: string; canonicalQuestionKey: string | null;
  /** Human-readable summary for ANY class (base stat OR the derived/segment fact). */
  label: string;
  /** Base-only structured statistic (null for derived/segment). */
  optionLabel: string | null; count: number | null; base: number | null; percentage: number | null;
  scope: string | null; surveyId: string | null; surveyName: string | null;
  resultMode: string | null; comparability: string | null;
  /** Segment-only dimension (e.g. "country"); null otherwise. */
  dimension: string | null;
};

const pctText = (p: number | null | undefined) => (p == null ? "—" : `${Math.round(p * 1000) / 10}%`);

/** Faithful render of one frozen evidence snapshot — no recomputation, any class. */
export function evidenceView(position: number, snapshot: FrozenEvidence | (EvidenceItem & { evidenceClass?: EvidenceClass })): EvidenceView {
  const cls = evidenceClassOf(snapshot as Record<string, unknown>);
  if (cls === "base") {
    const e = snapshot as EvidenceItem;
    return {
      position, ref: e.ref, evidenceClass: "base", question: e.question, canonicalQuestionKey: e.canonicalQuestionKey ?? null,
      label: `${e.optionLabel}: ${pctText(e.percentage)} (${e.count} of ${e.base})`,
      optionLabel: e.optionLabel, count: e.count, base: e.base, percentage: e.percentage,
      scope: e.scope, surveyId: e.surveyId, surveyName: e.surveyName,
      resultMode: e.resultMode ?? null, comparability: e.comparability ?? null, dimension: null,
    };
  }
  // derived | segment — the deterministic fact lives entirely in `label`.
  const d = snapshot as (DerivedEvidenceItem & { dimension?: string });
  return {
    position, ref: d.ref, evidenceClass: cls, question: d.question, canonicalQuestionKey: d.canonicalQuestionKey ?? null,
    label: d.label,
    optionLabel: null, count: null, base: null, percentage: null,
    scope: cls, surveyId: null, surveyName: null, resultMode: null, comparability: null,
    dimension: cls === "segment" ? (d.dimension ?? null) : null,
  };
}

/** Distinct source Surveys across a Finding's evidence (order-preserving). Derived/segment
 *  items carry no single source Survey and contribute none. */
export function sourceSurveys(evidence: readonly Record<string, unknown>[]): { id: string; name: string }[] {
  const seen = new Set<string>();
  const out: { id: string; name: string }[] = [];
  for (const e of evidence) {
    const id = (typeof e.surveyId === "string" ? e.surveyId : "") || "";
    const name = typeof e.surveyName === "string" ? e.surveyName : "";
    if (!id || seen.has(id)) continue;
    seen.add(id); out.push({ id, name });
  }
  return out;
}

export type FindingCard = {
  id: string; headline: string; status: string; originType: string;
  evidenceCount: number; createdBy: string | null; createdAt: string;
  publishedBy: string | null; publishedAt: string | null;
};
export function findingCard(row: { id: string; headline: string; status: string; origin_type: string; created_by: string | null; created_at: string; published_by: string | null; published_at: string | null }, evidenceCount: number): FindingCard {
  return {
    id: row.id, headline: row.headline, status: row.status, originType: row.origin_type,
    evidenceCount, createdBy: row.created_by, createdAt: row.created_at,
    publishedBy: row.published_by, publishedAt: row.published_at,
  };
}
