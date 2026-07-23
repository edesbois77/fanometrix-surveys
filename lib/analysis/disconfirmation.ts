// Disconfirmation — actively trying to break each proposition before it is
// allowed to proceed (docs/intelligence-model.md §5, invariant 8).
//
// This is the step that separates research from well-dressed summarisation, and
// it is the one that will most often look like an obvious economy. It is not.
// A proposition formed from a cluster of evidence has already selected for
// agreement: the items that fit were the ones that suggested the reading. Unless
// something goes back over the WHOLE admissible frame looking for the counter
// case, conflicting evidence is found only by accident, and the platform reports
// confidence it has not earned.
//
// Two things it produces that nothing else can:
//   - the contesting and qualifying evidence a claim has to survive
//   - the FACT that the search ran, which is why `disconfirmed` exists at all.
//     A claim with no counter-evidence FOUND is not the same as a claim with
//     none LOOKED FOR, and the assessment layer grades those differently.
//
// Each proposition is challenged INDEPENDENTLY. Batching rivals into one call
// would let the model compare them, and comparison is ranking, which happens
// later and from the evidence rather than from a model's impression.
//
// It never rewrites a claim and never grades one. It supplies grounds; the pure
// assessment layer decides what they are worth.
import { completeJSON } from "@/lib/intelligence/openai";
import { stripEmDash } from "@/lib/strip-em-dash";
import { EVIDENCE_ROLE_LABEL } from "@/lib/evidence-role";
import { CONTRIBUTION_LABEL, type CitationStance } from "@/lib/analysis/types";
import { projectFor, type EvidenceFrame, type AdmittedForClaim } from "@/lib/analysis/framing";
import { attributionRules } from "@/lib/analysis/formation";
import type { CandidateProposition, PropositionSet } from "@/lib/analysis/formation";

const CONTENT_CHARS = 600;
/** Challenges run concurrently, bounded so a wide frame cannot flood the model
 *  provider. Admin-triggered work, so a handful in flight is fine. */
const CONCURRENCY = 4;

export type StancedCitation = AdmittedForClaim & { stance: CitationStance };

export type Disconfirmation = {
  propositionId: string;
  /** How many admissible items were put up against this claim. The honest
   *  measure of how hard it was tested, and the denominator behind the verdict. */
  searched: number;
  /** Whether the challenge actually ran. False where it could not, so nothing
   *  downstream can mistake an unrun challenge for a survived one. */
  ran: boolean;
  contesting: number;
  qualifying: number;
  /** What the challenge found, in one plain sentence, for the analyst. */
  note: string;
};

export type TestedProposition = Omit<CandidateProposition, "citations"> & {
  citations: StancedCitation[];
  disconfirmation: Disconfirmation;
};

export type TestedSet = {
  needId: string;
  need: string;
  propositions: TestedProposition[];
  examined: number;
  /** Earned, not assumed. Only true where every surviving proposition was
   *  actually challenged. */
  disconfirmed: boolean;
};

// ── The challenge ────────────────────────────────────────────────────────────

export function buildChallengePrompt(opts: {
  proposition: CandidateProposition;
  need: string;
  candidates: AdmittedForClaim[];
}): string {
  const list = opts.candidates.map((e, i) => {
    const head = `${EVIDENCE_ROLE_LABEL[e.role].toUpperCase()} · ${CONTRIBUTION_LABEL[e.contribution]}${e.provenance ? `, ${e.provenance}` : ""}`;
    return `[${i}] (${head}) "${e.content.slice(0, CONTENT_CHARS)}"`;
  }).join("\n");

  return `You are a research reviewer whose job is to BREAK the claim below. You are not looking for support for it. Someone else has already done that, and if you do it too the claim goes out untested.

THE QUESTION being investigated:
"${opts.need}"

THE CLAIM you are trying to break:
"${opts.proposition.statement}"
It is offered as ${opts.proposition.assertion === "absence" ? "an absence of evidence" : `a claim about ${opts.proposition.scope || "no stated scope"}`}, on the grounds that: ${opts.proposition.warrant || "(no warrant given)"}

THE FULL EVIDENCE available on this question. Some of it was used to build the claim. Go through ALL of it, including the parts the claim already rests on, and decide what damages it:
${list || "(none)"}

ATTRIBUTION. These govern what each item can be used to say, when you are arguing against just as when you are arguing for:
${attributionRules(opts.candidates)}

Return ONLY valid JSON:
{
  "contesting": [indices of evidence that points the OTHER WAY: it suggests the claim is wrong, or that a different reading fits better],
  "qualifying": [indices of evidence that does not refute the claim but BOUNDS it: true for a narrower group, a different market, a different period, or only under conditions the claim does not state],
  "note": "one sentence on what survived and what did not"
}

HOW TO CHALLENGE, in order:
 1. LOOK FOR THE COUNTER CASE FIRST. Which items, read fairly, argue against this claim? An item the claim cites can still contest it if the claim has read it too generously.
 2. THEN LOOK FOR THE BOUNDARY. Evidence that holds only for some people, some markets or some moment does not refute a claim, it narrows it. A claim that is true of one group and stated of everyone is a claim that needs qualifying, and that is the commonest real fault.
 3. BE HONEST WHEN IT HOLDS. If the evidence genuinely does not damage the claim, return empty arrays and say so. Manufacturing a contradiction to look rigorous is as damaging as missing one.

RULES:
- Only cite indices shown above. An objection you cannot point at is not an objection.
- An item may appear in at most one list.
- Do NOT rewrite the claim, do not propose a better one, and do not say how confident you are in it. That is decided elsewhere, from the evidence, and anything you say about it will be discarded.
- Judge the claim as WRITTEN, including its scope. A claim explicitly limited to one group is not refuted by evidence about another.
- PUNCTUATION: use commas; NEVER use em-dashes or any long dash.`;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

type RawChallenge = { contesting?: unknown; qualifying?: unknown; note?: unknown };

const indices = (v: unknown, max: number): number[] =>
  Array.isArray(v) ? [...new Set(v.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < max))] : [];

/** Fold a challenge back into the proposition it tested.
 *
 *  PURE. Stance precedence is contests, then qualifies, then establishes: where
 *  an adversarial reading finds an item argues against the claim, it must not
 *  also be counted for it. The original citation was too generous, and the
 *  conservative reading is the one that stands. */
export function applyChallenge(opts: {
  proposition: CandidateProposition;
  candidates: AdmittedForClaim[];
  raw: RawChallenge | null;
  ran: boolean;
}): TestedProposition {
  const contestIdx = opts.ran ? indices(opts.raw?.contesting, opts.candidates.length) : [];
  const qualifyIdx = opts.ran ? indices(opts.raw?.qualifying, opts.candidates.length) : [];

  const contesting = new Set(contestIdx.map(i => opts.candidates[i].evidenceId));
  // An item cannot both contest and qualify. Contest is the stronger reading and
  // wins, so a model hedging across both lists cannot soften its own objection.
  const qualifying = new Set(
    qualifyIdx.map(i => opts.candidates[i].evidenceId).filter(id => !contesting.has(id)),
  );

  const byId = new Map<string, AdmittedForClaim>();
  for (const c of opts.candidates) byId.set(c.evidenceId, c);
  for (const c of opts.proposition.citations) byId.set(c.evidenceId, c);

  const citations: StancedCitation[] = [];
  const cited = new Set(opts.proposition.citations.map(c => c.evidenceId));
  for (const [id, item] of byId) {
    const stance: CitationStance | null =
      contesting.has(id) ? "contests"
      : qualifying.has(id) ? "qualifies"
      : cited.has(id) ? "establishes"
      : null;
    if (stance) citations.push({ ...item, stance });
  }

  const contestCount = citations.filter(c => c.stance === "contests").length;
  const qualifyCount = citations.filter(c => c.stance === "qualifies").length;

  return {
    ...opts.proposition,
    citations,
    disconfirmation: {
      propositionId: opts.proposition.id,
      searched: opts.candidates.length,
      ran: opts.ran,
      contesting: contestCount,
      qualifying: qualifyCount,
      note: opts.ran
        ? stripEmDash(typeof opts.raw?.note === "string" ? opts.raw.note.trim() : "") ||
          (contestCount === 0 && qualifyCount === 0
            ? `Tested against ${opts.candidates.length} items and nothing was found that damages it.`
            : `Tested against ${opts.candidates.length} items.`)
        : "This claim has not been tested against evidence that would contradict it.",
    },
  };
}

// ── Orchestration ────────────────────────────────────────────────────────────

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

/** Challenge every proposition in a set against the full admissible frame.
 *
 *  Each proposition is tested against the evidence admissible FOR ITS OWN
 *  assertion type, because an objection has to be able to speak to the kind of
 *  claim being made: evidence that cannot establish a cause cannot refute one
 *  either. */
export async function disconfirm(opts: {
  set: PropositionSet;
  frame: EvidenceFrame;
}): Promise<TestedSet> {
  const tested = await pool(opts.set.propositions, CONCURRENCY, async proposition => {
    // An absence claim rests on the search, not on grounds, so the thing that
    // would break it is evidence that DOES answer the question. That is exactly
    // the descriptive projection, which is why it is challenged against that.
    const projection = projectFor(opts.frame, proposition.isNull ? "descriptive" : proposition.assertion);
    const candidates = projection.admitted;

    if (candidates.length === 0) {
      return applyChallenge({ proposition, candidates, raw: null, ran: false });
    }

    try {
      const raw = await completeJSON<RawChallenge>({
        prompt: buildChallengePrompt({ proposition, need: opts.set.need, candidates }),
        maxTokens: 700,
      });
      return applyChallenge({ proposition, candidates, raw, ran: true });
    } catch {
      // A failed challenge is never treated as a survived one. The proposition
      // continues, honestly marked as untested, and the assessment layer grades
      // it down for exactly that.
      return applyChallenge({ proposition, candidates, raw: null, ran: false });
    }
  });

  return {
    needId: opts.set.needId,
    need: opts.set.need,
    propositions: tested,
    examined: opts.set.examined,
    disconfirmed: tested.length > 0 && tested.every(p => p.disconfirmation.ran),
  };
}
