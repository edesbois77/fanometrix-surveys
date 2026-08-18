// ── Survey Studio — Staged Analysis (routing, batching, Stage-1 validation) ──
// Separates COVERAGE (Stage 1: a first-pass review of the complete evidence, in bounded
// question batches, that surfaces candidate observations/patterns) from JUDGEMENT
// (Stage 2: synthesis of the narrative + curated proposals). Small studies keep the
// single-pass flow. Pure module: types, deterministic routing/batching, and Stage-1
// candidate validation (same evidence firewall as proposals — never a chain-of-thought).

import type { StudyResultGroup } from "@/lib/studio/study-results";
import { makeRefResolver, bannedLanguageReasons, type EvidenceItem } from "@/lib/studio/study-analysis";

export type AnalysisMode = "single_pass" | "staged";

// ── Deterministic routing (complexity, NOT response count) ───────────────────
// Staged when a study is complex enough that a single call under-covers it: many
// questions OR a large evidence set. FedEx (3 questions / 36 items) → single_pass;
// the stress study (13 / 280) → staged.
export const STAGED_MIN_QUESTIONS = 6;
export const STAGED_MIN_EVIDENCE = 60;

export function chooseAnalysisMode(payload: { evidence: EvidenceItem[] }): AnalysisMode {
  const questions = new Set(payload.evidence.map((e) => e.canonicalQuestionKey)).size;
  return questions >= STAGED_MIN_QUESTIONS || payload.evidence.length > STAGED_MIN_EVIDENCE ? "staged" : "single_pass";
}

// ── Bounded batching of result groups (by question — the governed model is
//    question-centric). Bounded batch size + a hard cap on batch count. ──────
export const GROUPS_PER_BATCH = 4;
export const MAX_BATCHES = 8; // > MAX_BATCHES*GROUPS_PER_BATCH question groups → too large for V1

export function batchResultGroups(groups: StudyResultGroup[], perBatch = GROUPS_PER_BATCH): { ok: boolean; batches: StudyResultGroup[][]; error?: string } {
  const batches: StudyResultGroup[][] = [];
  for (let i = 0; i < groups.length; i += perBatch) batches.push(groups.slice(i, i + perBatch));
  if (batches.length > MAX_BATCHES) return { ok: false, batches: [], error: `Study too large for staged analysis (${groups.length} question groups > ${MAX_BATCHES * perBatch}).` };
  return { ok: true, batches };
}

// ── Stage-1 candidate contract (structured research artifacts — NOT reasoning) ─
export const CANDIDATE_TYPES = ["observation", "comparison", "pattern", "tension", "minority", "outlier", "synthesis", "implication"] as const;
export type CandidateType = (typeof CANDIDATE_TYPES)[number];
export const OBJECTIVE_RELATIONS = ["supports", "challenges", "mixed", "context"] as const;
export type ObjectiveRelation = (typeof OBJECTIVE_RELATIONS)[number];

export type StudyCandidate = {
  type: CandidateType;
  summary: string;
  whyItMayMatter: string;
  evidenceRefs: string[];
  objectiveRelation: ObjectiveRelation;
};
export type CandidateValidation = { valid: StudyCandidate[]; rejected: { candidate: Partial<StudyCandidate>; reasons: string[] }[] };

const norm = (s: unknown) => (typeof s === "string" ? s.trim() : "");
const SUMMARY_MAX = 400;

/**
 * Validate Stage-1 candidates against the FULL run evidence (global short ids / full
 * refs both resolve). Same firewall as proposals: refs must resolve, banned language is
 * rejected, and a "comparison" candidate must cite directly-comparable evidence (one
 * canonical question, comparability=combined, ≥2 source surveys). Never a Study-wide
 * claim guard is applied at Stage 2 (the senior pass), where the whole picture is known.
 */
export function validateCandidates(raw: unknown, evidence: EvidenceItem[], derived: readonly { ref: string }[] = []): CandidateValidation {
  const allowed = new Map(evidence.map((e) => [e.ref, e])); // BASE only for the comparison firewall
  const resolve = makeRefResolver([...evidence, ...derived]);
  const list: unknown[] = Array.isArray(raw) ? raw : Array.isArray((raw as { candidates?: unknown[] })?.candidates) ? (raw as { candidates: unknown[] }).candidates : [];
  const valid: StudyCandidate[] = [];
  const rejected: { candidate: Partial<StudyCandidate>; reasons: string[] }[] = [];

  for (const item of list) {
    const c = (item ?? {}) as Record<string, unknown>;
    const reasons: string[] = [];
    const type = norm(c.type).toLowerCase() as CandidateType;
    const summary = norm(c.summary);
    const whyItMayMatter = norm(c.whyItMayMatter);
    let objectiveRelation = norm(c.objectiveRelation).toLowerCase() as ObjectiveRelation;
    if (!OBJECTIVE_RELATIONS.includes(objectiveRelation)) objectiveRelation = "context";
    const rawRefs = Array.isArray(c.evidenceRefs) ? c.evidenceRefs.map(norm).filter(Boolean) : [];

    if (!CANDIDATE_TYPES.includes(type)) reasons.push(`invalid candidate type "${norm(c.type)}"`);
    if (!summary) reasons.push("missing summary");
    if (summary.length > SUMMARY_MAX) reasons.push("summary too long");
    reasons.push(...bannedLanguageReasons(`${summary}\n${whyItMayMatter}`));

    const unknown = rawRefs.filter((r) => !resolve(r));
    if (unknown.length) reasons.push(`unknown evidence ref(s): ${unknown.join(", ")}`);
    const known = [...new Set(rawRefs.map(resolve).filter((r): r is string => !!r))];
    if (known.length < 1) reasons.push("candidate needs ≥1 evidence ref");

    if (type === "comparison" && known.length >= 2) {
      const items = known.map((r) => allowed.get(r)).filter((e): e is EvidenceItem => !!e);
      const keys = new Set(items.map((e) => e.canonicalQuestionKey));
      const nonCombinable = items.some((e) => e.comparability !== "combined");
      const surveys = new Set(items.filter((e) => e.scope === "survey").map((e) => e.surveyId));
      if (keys.size !== 1) reasons.push("comparison must stay within one comparable question");
      if (nonCombinable) reasons.push("comparison cites non-directly-comparable evidence");
      if (surveys.size < 2) reasons.push("comparison must contrast ≥2 source Surveys");
    }
    if (type === "comparison" && known.length < 2) reasons.push("comparison needs ≥2 evidence refs");

    if (reasons.length) rejected.push({ candidate: { type, summary, whyItMayMatter, evidenceRefs: rawRefs, objectiveRelation }, reasons });
    else valid.push({ type, summary, whyItMayMatter, evidenceRefs: known, objectiveRelation });
  }
  return { valid, rejected };
}

/** Deterministic coverage from what Stage-1 actually reviewed (code-derived, not model). */
export function stageCoverage(batches: StudyResultGroup[][], evidence: EvidenceItem[]): { questions: number; evidencePoints: number; batchCount: number; reviewedQuestionKeys: string[] } {
  const keys = new Set<string>();
  for (const b of batches) for (const g of b) keys.add(g.canonicalQuestionKey);
  return { questions: keys.size, evidencePoints: evidence.length, batchCount: batches.length, reviewedQuestionKeys: [...keys].sort() };
}
