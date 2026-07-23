// Adjudication — what a research consultant does to a claim.
//
// The design test for this file is not "can an analyst approve or reject". It is
// whether an analyst can do the things a consultant actually does: rewrite a
// claim the evidence does not carry, narrow one that overreaches, split one that
// is really two, merge two that are really one, take a rival reading instead of
// the proposed one, write a finding the engine never proposed, throw one out as
// immaterial rather than wrong, and demand more evidence. An adjudicator who can
// only accept or decline is a labeller, and the product is then a summarisation
// service with a review queue in front of it.
//
// THE PLATFORM ARGUES BACK. Reframing re-runs the compatibility matrix. An
// analyst who rewrites "fans discuss price" into "price is driving churn" has
// changed a description into a cause, and most of the citations stop being
// admissible: the claim survives, its grounds do not, and the confidence
// collapses. That is the line holding against its own analyst, which is the only
// way a line is worth anything.
//
// Every act appends a revision and every act is attributable. Editing an
// approved claim clears the approval, because a sign-off applied to different
// words than the ones now stored is not a sign-off.
//
// The rules are pure and exported. The writes are thin.
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { deriveConfidence, deriveEvidenceStrength } from "@/lib/analysis/assessment";
import { compatibility } from "@/lib/analysis/matrix";
import type { AssertionType, Citation, CitationStance, ConfidenceLevel, ContributionKind } from "@/lib/analysis/types";
import type { EvidenceRow, StoredEvidenceRow, StoredFinding } from "@/lib/analysis/finding-store";

export type RejectClass = "unwarranted" | "immaterial" | "duplicate" | "out_of_scope" | "wrong_assertion";

export const REJECT_REASON: Record<RejectClass, string> = {
  unwarranted:     "The evidence does not support this claim.",
  immaterial:      "True, but it does not bear on the decision this research serves.",
  duplicate:       "Already covered by another finding.",
  out_of_scope:    "Outside what this engagement was commissioned to answer.",
  wrong_assertion: "The claim is of a kind this evidence cannot establish.",
};

// ── Pure: the rules ──────────────────────────────────────────────────────────

/** The citations, as the assessment layer reads them. Rejected rows never count. */
export function citationsFrom(rows: EvidenceRow[]): Citation[] {
  return rows.filter(r => !r.rejected).map(r => ({
    stance: r.stance as CitationStance,
    admissibility: r.admissibility as "admissible" | "admissible_with_limits",
    contribution: r.contribution_kind as ContributionKind,
    observationKey: r.observation_key,
    observations: r.observations,
    weight: r.bearing,
  }));
}

/** Re-derive a finding's grade from its current grounds.
 *
 *  Called after ANY change to the claim or its citations, because a stored grade
 *  that no longer matches its evidence is worse than no grade at all: it looks
 *  authoritative and is not. */
export function recompute(opts: {
  assertion: AssertionType;
  disconfirmed: boolean;
  examined: number;
  rows: EvidenceRow[];
}) {
  const citations = citationsFrom(opts.rows);
  return {
    confidence: deriveConfidence({
      citations, assertion: opts.assertion,
      disconfirmed: opts.disconfirmed, examined: opts.examined,
    }),
    strength: deriveEvidenceStrength(citations),
  };
}

/** What survives a change of assertion type.
 *
 *  PURE, and the most important function here. An analyst may rewrite a claim
 *  into any kind they like; they may not carry evidence into it that cannot
 *  support that kind. Stripped citations are marked rejected rather than deleted,
 *  so the analyst can see exactly what their rewrite cost. */
export function reframeCitations<R extends EvidenceRow>(rows: R[], assertion: AssertionType): {
  kept: R[];
  stripped: R[];
} {
  const kept: R[] = [];
  const stripped: R[] = [];
  for (const row of rows) {
    if (row.rejected) { stripped.push(row); continue; }
    const cell = compatibility(assertion, row.contribution_kind as ContributionKind);
    if (cell.verdict === "inadmissible") {
      stripped.push({ ...row, rejected: true, rejected_reason: cell.constraint ?? "This kind of evidence cannot support this kind of claim." });
      continue;
    }
    // A rewrite can also TIGHTEN a citation without removing it.
    kept.push({ ...row, admissibility: cell.verdict, constraint_note: cell.constraint });
  }
  return { kept, stripped };
}

export type FindingStatus = "candidate" | "in_review" | "approved" | "rejected" | "superseded";

const TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
  candidate:  ["in_review", "approved", "rejected", "superseded"],
  in_review:  ["approved", "rejected", "candidate", "superseded"],
  // Reopening an approved claim is allowed and is not an error: new evidence,
  // a challenge, or a second reader can all reasonably unsettle a sign-off.
  approved:   ["in_review", "rejected", "superseded"],
  rejected:   ["in_review", "superseded"],
  superseded: [],
};

export const canTransition = (from: FindingStatus, to: FindingStatus): boolean =>
  TRANSITIONS[from]?.includes(to) ?? false;

/** Whether two claims may be merged.
 *
 *  Merging is a CLAIM operation, not a text operation. Two findings merge only
 *  if they assert the same kind of thing over compatible scope; otherwise the
 *  merged claim would assert something neither parent did. */
export function canMerge(a: Pick<StoredFinding, "assertion_type" | "need_id">, b: Pick<StoredFinding, "assertion_type" | "need_id">): { ok: boolean; reason?: string } {
  if (a.assertion_type !== b.assertion_type) {
    return { ok: false, reason: "These claim different kinds of thing, so merging them would assert something neither one does." };
  }
  if (a.need_id !== b.need_id) {
    return { ok: false, reason: "These answer different questions. Merging them would leave the merged claim with no single question to answer." };
  }
  return { ok: true };
}

/** Whether a statement is really two claims wearing one sentence. Advisory: it
 *  prompts a split, it does not force one. */
export function looksLikeTwoClaims(statement: string): boolean {
  const hasVerb = (s: string) => /\b(is|are|was|were|has|have|does|do|drives?|holds?|shapes?|falls?|rises?)\b/i.test(s);
  // A semicolon or an explicit additive joins two independent clauses often
  // enough to be worth a prompt.
  if (statement.includes(";")) return true;
  if (/\b(and also|as well as)\b/i.test(statement)) return true;
  // A bare "and" is only a signal when BOTH sides stand as clauses of their own.
  // "Fans value access and community" is one claim; "price is the barrier and
  // trust is falling" is two.
  const parts = statement.split(/\band\b/i);
  return parts.length >= 2 && parts.every(hasVerb);
}

// ── Writes ───────────────────────────────────────────────────────────────────

type RevisionAction =
  | "authored" | "reframed" | "narrowed" | "split" | "merged" | "evidence_changed"
  | "evidence_requested" | "override" | "approved" | "rejected" | "published"
  | "withheld" | "superseded" | "reopened";

async function revise(opts: {
  findingId: string; version: number; action: RevisionAction; actor: string;
  summary: string; before?: unknown; after?: unknown;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("finding_revisions").insert({
    finding_id: opts.findingId, version: opts.version, action: opts.action,
    actor: opts.actor, summary: opts.summary,
    before: opts.before ?? null, after: opts.after ?? null,
  });
  if (error) throw new Error(error.message);
}

async function loadFinding(id: string): Promise<{ finding: StoredFinding; rows: StoredEvidenceRow[] }> {
  const { data } = await supabaseAdmin.from("findings").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("Finding not found.");
  const { data: rows } = await supabaseAdmin.from("finding_evidence").select("*").eq("finding_id", id);
  return { finding: data as StoredFinding, rows: (rows ?? []) as StoredEvidenceRow[] };
}

/** Persist a recomputed grade. Every path that touches a claim or its grounds
 *  goes through here, so a stored grade can never drift from its evidence. */
async function writeAssessment(id: string, assertion: AssertionType, disconfirmed: boolean, examined: number, rows: EvidenceRow[]) {
  const { confidence, strength } = recompute({ assertion, disconfirmed, examined, rows });
  await supabaseAdmin.from("findings").update({
    confidence_level: confidence.level,
    evidence_strength: strength.level,
    assessment: {
      confidence: { level: confidence.level, rationale: confidence.rationale, factors: confidence.factors, what_would_raise_it: confidence.whatWouldRaiseIt },
      strength: { level: strength.level, score: strength.score, rationale: strength.rationale, independence: strength.independence, kinds: strength.kinds, all_with_limits: strength.allWithLimits },
    },
  }).eq("id", id);
  return { confidence, strength };
}

/** Editing invalidates a prior sign-off: an approval applied to different words
 *  than the ones now stored is not an approval. */
const unapproved = (f: StoredFinding) =>
  f.status === "approved" ? { status: "in_review", reviewed_by: null, reviewed_at: null, published: false } : {};

// ── On the claim ─────────────────────────────────────────────────────────────

/** The evidence was right and the claim was wrong. The commonest real act, and
 *  the one that most needs the matrix re-run behind it. */
export async function reframe(opts: {
  findingId: string; actor: string;
  statement: string; assertion?: AssertionType; scope?: string; warrant?: string;
}): Promise<{ strippedCitations: number; confidence: ConfidenceLevel }> {
  const { finding, rows } = await loadFinding(opts.findingId);
  const assertion = opts.assertion ?? (finding.assertion_type as AssertionType);
  const { kept, stripped } = reframeCitations(rows, assertion);

  const newlyStripped = stripped.filter(s => !rows.find(r => r.id === s.id)?.rejected);
  for (const row of newlyStripped) {
    await supabaseAdmin.from("finding_evidence")
      .update({ rejected: true, rejected_reason: row.rejected_reason }).eq("id", row.id);
  }
  for (const row of kept) {
    await supabaseAdmin.from("finding_evidence")
      .update({ admissibility: row.admissibility, constraint_note: row.constraint_note }).eq("id", row.id);
  }

  const version = finding.version + 1;
  await supabaseAdmin.from("findings").update({
    statement: opts.statement,
    assertion_type: assertion,
    ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    ...(opts.warrant !== undefined ? { warrant: opts.warrant } : {}),
    version,
    ...unapproved(finding),
  }).eq("id", opts.findingId);

  const { confidence } = await writeAssessment(
    opts.findingId, assertion, finding.disconfirmed, examinedOf(finding), [...kept, ...stripped],
  );

  await revise({
    findingId: opts.findingId, version, action: "reframed", actor: opts.actor,
    summary: newlyStripped.length
      ? `Reframed. ${newlyStripped.length} citation${newlyStripped.length === 1 ? "" : "s"} no longer support the claim as written.`
      : "Reframed.",
    before: { statement: finding.statement, assertion_type: finding.assertion_type },
    after: { statement: opts.statement, assertion_type: assertion },
  });

  return { strippedCitations: newlyStripped.length, confidence: confidence.level };
}

/** Accept the claim, but only within tighter boundaries. The commonest fix for a
 *  claim that is true of some people and stated of everyone. */
export async function narrow(opts: { findingId: string; actor: string; scope: string }): Promise<void> {
  const { finding } = await loadFinding(opts.findingId);
  const version = finding.version + 1;
  await supabaseAdmin.from("findings")
    .update({ scope: opts.scope, version, ...unapproved(finding) }).eq("id", opts.findingId);
  await revise({
    findingId: opts.findingId, version, action: "narrowed", actor: opts.actor,
    summary: "Scope narrowed.", before: { scope: finding.scope }, after: { scope: opts.scope },
  });
}

/** One claim was really two. Both parts are new findings; the original is
 *  superseded and stays readable. */
export async function split(opts: {
  findingId: string; actor: string;
  parts: { statement: string; scope?: string; warrant?: string; evidenceRefs: string[] }[];
}): Promise<string[]> {
  if (opts.parts.length < 2) throw new Error("A split needs at least two parts.");
  const { finding, rows } = await loadFinding(opts.findingId);

  const ids: string[] = [];
  for (const part of opts.parts) {
    const id = randomUUID();
    ids.push(id);
    const keep = rows.filter(r => part.evidenceRefs.includes(r.evidence_ref));

    const { error } = await supabaseAdmin.from("findings").insert({
      ...findingCore(finding),
      id,
      statement: part.statement,
      scope: part.scope ?? finding.scope,
      warrant: part.warrant ?? finding.warrant,
      status: "candidate",
      version: 1,
      split_from_id: finding.id,
      authored_by: opts.actor,
    });
    if (error) throw new Error(error.message);

    if (keep.length) {
      const { error: evErr } = await supabaseAdmin.from("finding_evidence")
        .insert(keep.map(({ id: _id, ...r }) => ({ ...r, finding_id: id })));
      if (evErr) throw new Error(evErr.message);
    }
    await writeAssessment(id, finding.assertion_type as AssertionType, finding.disconfirmed, examinedOf(finding), keep);
    await revise({
      findingId: id, version: 1, action: "split", actor: opts.actor,
      summary: `Split out of "${finding.statement}".`,
    });
  }

  await supersede(finding, opts.actor, `Split into ${opts.parts.length} claims.`);
  return ids;
}

/** Two claims were really one. The merged claim's grounds are the union, and its
 *  grade is recomputed rather than inherited: a union can expose conflict neither
 *  parent saw, and the merged confidence may be LOWER than both. */
export async function merge(opts: {
  findingIds: string[]; actor: string; statement: string; scope?: string; warrant?: string;
}): Promise<string> {
  if (opts.findingIds.length < 2) throw new Error("A merge needs at least two findings.");
  const loaded = await Promise.all(opts.findingIds.map(loadFinding));

  for (let i = 1; i < loaded.length; i++) {
    const verdict = canMerge(loaded[0].finding, loaded[i].finding);
    if (!verdict.ok) throw new Error(verdict.reason);
  }

  const id = randomUUID();
  const parent = loaded[0].finding;
  const { error } = await supabaseAdmin.from("findings").insert({
    ...findingCore(parent),
    id, statement: opts.statement,
    scope: opts.scope ?? parent.scope,
    warrant: opts.warrant ?? parent.warrant,
    status: "candidate", version: 1, authored_by: opts.actor,
  });
  if (error) throw new Error(error.message);

  // Union by evidence ref, so an item cited by both parents is one citation.
  const seen = new Set<string>();
  const union: Omit<EvidenceRow, "finding_id">[] = [];
  for (const { rows } of loaded) {
    for (const { id: _id, finding_id: _f, ...r } of rows as (EvidenceRow & { id: string })[]) {
      if (seen.has(r.evidence_ref)) continue;
      seen.add(r.evidence_ref);
      union.push(r);
    }
  }
  if (union.length) {
    const { error: evErr } = await supabaseAdmin.from("finding_evidence")
      .insert(union.map(r => ({ ...r, finding_id: id })));
    if (evErr) throw new Error(evErr.message);
  }

  await writeAssessment(
    id, parent.assertion_type as AssertionType,
    loaded.every(l => l.finding.disconfirmed), examinedOf(parent), union as EvidenceRow[],
  );
  await revise({
    findingId: id, version: 1, action: "merged", actor: opts.actor,
    summary: `Merged from ${loaded.length} claims.`,
    before: { merged_from: loaded.map(l => l.finding.statement) },
  });

  for (const { finding } of loaded) {
    await supabaseAdmin.from("findings").update({ merged_into_id: id }).eq("id", finding.id);
    await supersede(finding, opts.actor, "Merged into a single claim.");
  }
  return id;
}

/** A finding the engine never proposed. This is the affordance that makes an
 *  analyst an author rather than a moderator: same object, same warranting, same
 *  derived grade, different origin. */
export async function author(opts: {
  projectId: string; actor: string;
  need: { id: string; text: string; aspect: string | null; requirementKey: string; requirementText: string };
  statement: string; assertion: AssertionType; scope: string; warrant: string;
  evidence: Omit<EvidenceRow, "finding_id">[];
}): Promise<string> {
  const id = randomUUID();
  const { kept, stripped } = reframeCitations(opts.evidence as EvidenceRow[], opts.assertion);

  const { error } = await supabaseAdmin.from("findings").insert({
    id, research_project_id: opts.projectId,
    requirement_key: opts.need.requirementKey, requirement_text: opts.need.requirementText,
    need_id: opts.need.id, need_text: opts.need.text, aspect: opts.need.aspect,
    statement: opts.statement, assertion_type: opts.assertion,
    scope: opts.scope, warrant: opts.warrant,
    is_null: opts.assertion === "absence",
    status: "candidate", authored_by: opts.actor, version: 1,
    // An analyst's own claim has not been challenged by the engine, and must not
    // be graded as though it had.
    disconfirmed: false,
  });
  if (error) throw new Error(error.message);

  const all = [...kept, ...stripped];
  if (all.length) {
    await supabaseAdmin.from("finding_evidence").insert(all.map(r => ({ ...r, finding_id: id })));
  }
  await writeAssessment(id, opts.assertion, false, all.length, all);
  await revise({ findingId: id, version: 1, action: "authored", actor: opts.actor, summary: "Written by the analyst." });
  return id;
}

// ── On the grounds ───────────────────────────────────────────────────────────

/** Change what a cited item DOES for a claim. An analyst reading an item as
 *  contesting where the engine read it as supporting is the single most
 *  informative correction available, and the grade follows immediately. */
export async function restance(opts: {
  findingId: string; evidenceRef: string; stance: CitationStance; actor: string;
}): Promise<ConfidenceLevel> {
  const { finding, rows } = await loadFinding(opts.findingId);
  const target = rows.find(r => r.evidence_ref === opts.evidenceRef && !r.rejected);
  if (!target) throw new Error("That evidence is not cited by this finding.");

  await supabaseAdmin.from("finding_evidence")
    .update({ stance: opts.stance }).eq("finding_id", opts.findingId).eq("evidence_ref", opts.evidenceRef);

  const updated = rows.map(r => (r.evidence_ref === opts.evidenceRef ? { ...r, stance: opts.stance } : r));
  const version = finding.version + 1;
  await supabaseAdmin.from("findings").update({ version, ...unapproved(finding) }).eq("id", opts.findingId);
  const { confidence } = await writeAssessment(
    opts.findingId, finding.assertion_type as AssertionType, finding.disconfirmed, examinedOf(finding), updated,
  );
  await revise({
    findingId: opts.findingId, version, action: "evidence_changed", actor: opts.actor,
    summary: `Evidence re-read as ${opts.stance}.`,
    before: { stance: target.stance }, after: { stance: opts.stance },
  });
  return confidence.level;
}

/** Drop a citation. Kept as rejected rather than deleted: what a claim was once
 *  built on is part of its history. */
export async function dropCitation(opts: {
  findingId: string; evidenceRef: string; actor: string; reason: string;
}): Promise<ConfidenceLevel> {
  const { finding, rows } = await loadFinding(opts.findingId);
  await supabaseAdmin.from("finding_evidence")
    .update({ rejected: true, rejected_reason: opts.reason })
    .eq("finding_id", opts.findingId).eq("evidence_ref", opts.evidenceRef);

  const updated = rows.map(r => (r.evidence_ref === opts.evidenceRef ? { ...r, rejected: true } : r));
  const version = finding.version + 1;
  await supabaseAdmin.from("findings").update({ version, ...unapproved(finding) }).eq("id", opts.findingId);
  const { confidence } = await writeAssessment(
    opts.findingId, finding.assertion_type as AssertionType, finding.disconfirmed, examinedOf(finding), updated,
  );
  await revise({
    findingId: opts.findingId, version, action: "evidence_changed", actor: opts.actor,
    summary: `Citation withdrawn: ${opts.reason}`,
  });
  return confidence.level;
}

/** "I cannot warrant this. Go and get me X."
 *
 *  The most consultancy-like act in the system. Recorded against the finding and
 *  the question it answers, so the gap is a piece of work rather than a note.
 *  Turning it into an actual collection task is the collection layer's job. */
export async function requestEvidence(opts: {
  findingId: string; actor: string; what: string;
}): Promise<void> {
  const { finding } = await loadFinding(opts.findingId);
  await revise({
    findingId: opts.findingId, version: finding.version, action: "evidence_requested",
    actor: opts.actor, summary: opts.what,
    after: { need_id: finding.need_id, requirement_key: finding.requirement_key, requested: opts.what },
  });
}

// ── On the assessment ────────────────────────────────────────────────────────

/** Override the derived grade, visibly and with a reason. The derived value is
 *  never replaced, so the two can always be compared and the rubric can be
 *  improved by looking at where people disagreed with it. */
export async function overrideConfidence(opts: {
  findingId: string; actor: string; level: ConfidenceLevel; reason: string;
}): Promise<void> {
  if (!opts.reason.trim()) throw new Error("An override needs a reason.");
  const { finding } = await loadFinding(opts.findingId);
  const version = finding.version + 1;
  await supabaseAdmin.from("findings").update({
    override_confidence: opts.level, override_reason: opts.reason, version,
  }).eq("id", opts.findingId);
  await revise({
    findingId: opts.findingId, version, action: "override", actor: opts.actor,
    summary: `Confidence set to ${opts.level} by the analyst.`,
    before: { derived: finding.confidence_level }, after: { override: opts.level, reason: opts.reason },
  });
}

// ── Disposition ──────────────────────────────────────────────────────────────

async function supersede(finding: StoredFinding, actor: string, why: string): Promise<void> {
  await supabaseAdmin.from("findings").update({ status: "superseded" }).eq("id", finding.id);
  await revise({ findingId: finding.id, version: finding.version, action: "superseded", actor, summary: why });
}

/** The research judgement. Accountable to a named person, on a date, and never
 *  granted by default. Approving a rank 2 reading is how an analyst promotes a
 *  rival over the one the engine put first. */
export async function approve(opts: { findingId: string; actor: string; note?: string }): Promise<void> {
  const { finding } = await loadFinding(opts.findingId);
  if (!canTransition(finding.status as FindingStatus, "approved")) {
    throw new Error(`A ${finding.status} finding cannot be approved.`);
  }
  const version = finding.version + 1;
  await supabaseAdmin.from("findings").update({
    status: "approved", reviewed_by: opts.actor, reviewed_at: new Date().toISOString(),
    version, ...(opts.note ? { analyst_note: opts.note } : {}),
  }).eq("id", opts.findingId);
  await revise({
    findingId: opts.findingId, version, action: "approved", actor: opts.actor,
    summary: finding.rank > 1
      ? `Approved in place of the reading the engine ranked first.`
      : `Approved.`,
  });
}

export async function reject(opts: {
  findingId: string; actor: string; rejectClass: RejectClass; note?: string;
}): Promise<void> {
  const { finding } = await loadFinding(opts.findingId);
  if (!canTransition(finding.status as FindingStatus, "rejected")) {
    throw new Error(`A ${finding.status} finding cannot be rejected.`);
  }
  const version = finding.version + 1;
  await supabaseAdmin.from("findings").update({
    status: "rejected", reject_class: opts.rejectClass,
    reject_reason: opts.note ?? REJECT_REASON[opts.rejectClass],
    reviewed_by: opts.actor, reviewed_at: new Date().toISOString(), version,
  }).eq("id", opts.findingId);
  await revise({
    findingId: opts.findingId, version, action: "rejected", actor: opts.actor,
    summary: opts.note ?? REJECT_REASON[opts.rejectClass],
  });
}

/** The commercial judgement, deliberately separate from the research one. A
 *  claim can be true, approved, and held back. */
export async function publish(opts: { findingId: string; actor: string; publish: boolean }): Promise<void> {
  const { finding } = await loadFinding(opts.findingId);
  if (opts.publish && finding.status !== "approved") {
    throw new Error("Only an approved finding can be published.");
  }
  await supabaseAdmin.from("findings").update({
    published: opts.publish, published_at: opts.publish ? new Date().toISOString() : null,
  }).eq("id", opts.findingId);
  await revise({
    findingId: opts.findingId, version: finding.version,
    action: opts.publish ? "published" : "withheld", actor: opts.actor,
    summary: opts.publish ? "Released into deliverables." : "Held back from deliverables.",
  });
}

/** Unsettle a sign-off. New evidence, a challenge or a second reader can all
 *  reasonably reopen an approved claim, and doing so is not an error. */
export async function reopen(opts: { findingId: string; actor: string; why: string }): Promise<void> {
  const { finding } = await loadFinding(opts.findingId);
  if (!canTransition(finding.status as FindingStatus, "in_review")) {
    throw new Error(`A ${finding.status} finding cannot be reopened.`);
  }
  const version = finding.version + 1;
  await supabaseAdmin.from("findings").update({
    status: "in_review", reviewed_by: null, reviewed_at: null, published: false, version,
  }).eq("id", opts.findingId);
  await revise({ findingId: opts.findingId, version, action: "reopened", actor: opts.actor, summary: opts.why });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const examinedOf = (f: StoredFinding): number =>
  ((f.disconfirmation as { searched?: number } | null)?.searched ?? 0);

/** The columns a derived finding inherits from its parent. Everything about the
 *  CLAIM is supplied fresh, so a split or a merge cannot silently carry over a
 *  statement nobody wrote. */
const findingCore = (f: StoredFinding) => ({
  research_project_id: f.research_project_id,
  requirement_key: f.requirement_key, requirement_text: f.requirement_text,
  need_id: f.need_id, need_text: f.need_text, aspect: f.aspect,
  assertion_type: f.assertion_type, temporal_validity: f.temporal_validity,
  is_null: f.is_null, disconfirmed: f.disconfirmed, disconfirmation: f.disconfirmation,
  rank: f.rank, run_id: f.run_id, model: f.model,
  matrix_version: f.matrix_version, assertion_taxonomy_version: f.assertion_taxonomy_version,
});
