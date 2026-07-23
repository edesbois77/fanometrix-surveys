// Proposition Formation — the stage that proposes what the evidence might mean
// (docs/intelligence-model.md §5 FORMATION).
//
// It generates COMPETING candidate propositions for one Information Need rather
// than converging on one, because a claim formed alone has nothing to be better
// than. Rival readings of the same evidence make the eventual choice an argument
// that can be inspected instead of an assertion that has to be trusted, and they
// surface genuine disagreement in the evidence rather than smoothing it away.
// Where the evidence does not answer the question, the NULL proposition is a
// legitimate candidate and often the right one.
//
// IT NEVER ASSESSES. No confidence, no evidence strength, no ranking, no
// selection. Those belong to the assessment layer, which is a pure function this
// stage cannot see (Principle 10: nothing that writes a claim may grade it). The
// output here is deliberately un-graded, so the grader meets the propositions
// cold.
//
// The prompt-facing parts are pure and exported. The single call to a model is
// the only I/O, and everything that decides what survives is a function that runs
// without one.
import { completeJSON } from "@/lib/intelligence/openai";
import { stripEmDash } from "@/lib/strip-em-dash";
import { EVIDENCE_ROLE_LABEL, EVIDENCE_ROLE_ATTRIBUTION_RULE, type EvidenceRole } from "@/lib/evidence-role";
import {
  type AssertionType, type ContributionKind, CONTRIBUTION_LABEL, ASSERTION_LABEL,
} from "@/lib/analysis/types";
import { compatibility } from "@/lib/analysis/matrix";
import { projectFor, type EvidenceFrame, type AdmittedForClaim } from "@/lib/analysis/framing";

/** How many items are put in front of the model. Fewer, fuller items reason
 *  better than more fragments: a truncated post produces a claim built on half a
 *  thought. Everything examined still counts toward the frame's own totals, so
 *  bounding what is SHOWN never inflates what is claimed. */
const MAX_SHOWN = 30;
const CONTENT_CHARS = 600;

const ASSERTION_TYPES: AssertionType[] = [
  "descriptive", "comparative", "magnitude", "temporal", "causal", "predictive", "absence",
];

/** One candidate reading of the evidence. Not a Finding: nothing has assessed it,
 *  nobody has adjudicated it, and it competes with its siblings. */
export type CandidateProposition = {
  /** Stable within a formation run, so assessment and review can refer to one. */
  id: string;
  needId: string;
  /** The claim, leading with the judgement. */
  statement: string;
  assertion: AssertionType;
  /** The boundary conditions the evidence actually supports. Unbounded claims
   *  read as universal, which is nearly always false. */
  scope: string;
  /** Why these grounds support this claim. Distinct from the statement and from
   *  the evidence: if it can be deleted without loss, the claim was not argued. */
  warrant: string;
  /** What reading this represents, so rival propositions can be compared as
   *  explanations rather than as sentences. */
  reading: string;
  /** Resolved from the indices the model cited, filtered to what the matrix
   *  admits for THIS proposition's assertion type. */
  citations: AdmittedForClaim[];
  /** Citations the model offered that its own assertion type cannot use. Kept,
   *  because a model reaching for inadmissible evidence is a signal about the
   *  claim, and silently dropping it hides that. */
  rejectedCitations: { evidenceId: string; reason: string }[];
  isNull: boolean;
};

export type PropositionSet = {
  needId: string;
  need: string;
  propositions: CandidateProposition[];
  /** Everything examined against this need, admitted or not. The denominator an
   *  absence proposition is judged on. */
  examined: number;
  /** Formation proposes; it does not test. Disconfirmation is the next stage and
   *  sets this true, so a proposition can never be graded as though it had
   *  survived a challenge that never ran. */
  disconfirmed: false;
};

// ── The prompt ───────────────────────────────────────────────────────────────

/** Every figure the model is permitted to use, computed here. Nothing else.
 *  This is what keeps consultancy prose from drifting into invented frequency
 *  claims, and it is carried forward from the engine this layer replaces. */
export function frameFacts(frame: EvidenceFrame): string {
  const kinds = frame.kinds.map(k => CONTRIBUTION_LABEL[k]).join(", ");
  const roles = (Object.entries(frame.roles) as [EvidenceRole, number][])
    .filter(([, n]) => n > 0)
    .map(([r, n]) => `${n} ${EVIDENCE_ROLE_LABEL[r].toLowerCase()}`);
  return [
    `- Evidence items bearing on this question: ${frame.admitted.length} of ${frame.examined} examined`,
    `- Independent observations behind them: ${frame.observations}`,
    `- Kinds of evidence present: ${kinds || "none"}`,
    roles.length ? `- Evidence by role: ${roles.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

/** What each assertion type would require, stated only for the ones this frame
 *  could actually support. A model told it may make any kind of claim will make
 *  the most impressive one available; told which are open to it, it argues
 *  within the evidence it has. */
export function assertionMenu(frame: EvidenceFrame): string {
  const open = frame.supportable.filter(a => a !== "absence");
  const closed = ASSERTION_TYPES.filter(a => a !== "absence" && !frame.supportable.includes(a));
  const lines = [
    open.length
      ? `OPEN to this evidence: ${open.map(a => `"${a}" (${ASSERTION_LABEL[a]})`).join(", ")}.`
      : `NO ordinary claim type is open to this evidence.`,
  ];
  if (closed.length) {
    lines.push(`CLOSED, and a proposition of these kinds will be discarded whatever it says: ${closed.map(a => `"${a}" (${ASSERTION_LABEL[a]})`).join(", ")}. This is not a judgement about the evidence's quality, it is what this kind of evidence is not able to establish.`);
  }
  lines.push(`ALWAYS available: "absence", the proposition that this evidence does not answer the question.`);
  return lines.join("\n");
}

/** The attribution rules for exactly what is present. Generated from the roles
 *  and contribution kinds in the frame rather than written per source, so a new
 *  evidence source inherits its prohibitions without a new prompt block. */
export function attributionRules(items: AdmittedForClaim[]): string {
  const roles = [...new Set(items.map(i => i.role))];
  const kinds = [...new Set(items.map(i => i.contribution))];
  const kindRule: Record<ContributionKind, string> = {
    elicited_perception:  "is what people said WHEN ASKED. It establishes stated attitude, never what anyone did.",
    unprompted_discourse: "is what people said UNBIDDEN. It establishes what was expressed, never what a population thinks or how many hold a view.",
    documented_activity:  "records what VERIFIABLY HAPPENED. It establishes events, never what any audience thought of them.",
    interested_claim:     "is a party speaking ABOUT ITSELF. It establishes only that the claim was made, and you must attribute it in the sentence.",
    expert_judgement:     "is ONE named professional's assessment. Attribute it. It is never consensus and never audience opinion.",
    established_knowledge: "is research done ELSEWHERE. It never establishes that the same holds for this engagement.",
  };
  return [
    ...roles.map(r => `- ${EVIDENCE_ROLE_LABEL[r].toUpperCase()} evidence ${EVIDENCE_ROLE_ATTRIBUTION_RULE[r]}`),
    ...kinds.map(k => `- ${CONTRIBUTION_LABEL[k].toUpperCase()} ${kindRule[k]}`),
  ].join("\n");
}

export function buildFormationPrompt(opts: {
  need: string;
  aspect: string;
  lens: string;
  frame: EvidenceFrame;
  shown: AdmittedForClaim[];
}): string {
  const list = opts.shown.map((e, i) => {
    const head = `${EVIDENCE_ROLE_LABEL[e.role].toUpperCase()} · ${CONTRIBUTION_LABEL[e.contribution]}${e.provenance ? `, ${e.provenance}` : ""}`;
    const limit = e.admissibility === "admissible_with_limits" && e.constraint ? `\n     limit: ${e.constraint}` : "";
    return `[${i}] (${head}) "${e.content.slice(0, CONTENT_CHARS)}"${limit}`;
  }).join("\n");

  return `You are a senior research consultant. You are NOT writing an answer yet. You are proposing the RIVAL READINGS of this evidence that deserve to be compared, so the strongest one can be chosen on the merits afterwards.

THE QUESTION you are proposing readings of, under the research aspect "${opts.aspect}":
"${opts.need}"

THE ENGAGEMENT (reason from this throughout, never merely describe the evidence):
${opts.lens || "- (no engagement context recorded; reason from the question alone)"}

THE EVIDENCE admitted to this question:
${list || "(none)"}

WHAT KIND OF CLAIM YOU MAY MAKE. Every proposition declares an "assertion" naming what kind of claim it is, and the kind decides which evidence may support it:
${assertionMenu(opts.frame)}

ATTRIBUTION. Each item is tagged with the role it was collected for and the kind of knowledge it supplies. These govern what you may say about it and they are not negotiable:
${attributionRules(opts.shown)}
Never blend roles into a single claim about the client. Where a reading rests on comparative or strategic evidence, say whose evidence it is.

THE FACTS (computed, exact). These are the ONLY figures you may state. Never count, estimate or infer a number yourself:
${frameFacts(opts.frame)}

Return ONLY valid JSON:
{
  "propositions": [
    {
      "reading": "a short label for the explanation this represents, e.g. 'price is the barrier' or 'the barrier is trust, not price'",
      "statement": "the claim, one or two sentences, leading with the judgement",
      "assertion": "one of the assertion values above",
      "scope": "who, where and when this holds, from the evidence only",
      "warrant": "why THIS evidence supports THIS claim, in one sentence",
      "evidence": [array of the indices above that support this reading]
    }
  ]
}

HOW TO PROPOSE RIVALS, which is the whole task:
 1. Read the evidence for what it might mean, not for what it says.
 2. Propose 2 to 4 genuinely COMPETING readings. Competing means they cannot all be true: the same evidence read a different way, a different cause behind the same pattern, or a narrower claim that survives where a broader one does not. Two sentences making the same point in different words are ONE reading, not two.
 3. Where the evidence genuinely disagrees with itself, propose BOTH sides as rival readings. Do not average them into a middle position that nothing supports.
 4. Include an "absence" proposition whenever the evidence does not settle this question. It is a legitimate answer, often the right one, and it is never a failure. Its statement says plainly what the evidence does not establish and what would.

WHAT EACH PROPOSITION MUST DO:
 - LEAD WITH THE JUDGEMENT. The first clause states what you conclude, not what was observed.
 - STAY INSIDE ITS SCOPE. Say who and when it holds for. An unbounded claim reads as a universal one and will be wrong.
 - CITE ONLY WHAT YOU WERE SHOWN. Every index must appear above. A reading you cannot cite is not a reading, it is a guess.
 - WARRANT ITSELF. The warrant explains why this evidence carries this claim. If it merely restates the claim or the evidence, the proposition is not argued.

WEAK (a description, and not a proposition): "Fans express frustration about matchday experience."
STRONG (a reading that could be wrong): "Matchday experience, not the sponsorship itself, is what shapes how this sponsor is judged: it is raised unprompted more than any other theme and it is the only one where the tone is consistently negative. If that holds, the sponsor is being marked on an experience it does not control."

QUANTIFICATION, strictly: you may only use figures given in THE FACTS, verbatim. Do NOT invent counts, percentages or proportions. Do NOT make a comparative or superlative claim ("most", "strongest", "consistently") unless THE FACTS support it.

DO NOT rank the propositions, do not say which is strongest, and do not state how confident you are in any of them. That judgement is made separately, from the evidence, and anything you say about it will be discarded.

BANNED as filler: "authentic engagement", "emotional connection", "deeper connection", "meaningful engagement", "cultural resonance", "resonate with", "tap into", "leverage", "in today's landscape".
VOICE: plain, confident consultant prose. No hedging, no throat-clearing, no mention of AI, prompts or scores. PUNCTUATION: use commas; NEVER use em-dashes or any long dash.`;
}

// ── Parsing, which is where the rules are enforced ───────────────────────────

type RawProposition = {
  reading?: unknown; statement?: unknown; assertion?: unknown;
  scope?: unknown; warrant?: unknown; evidence?: unknown;
};

const str = (v: unknown): string => stripEmDash(typeof v === "string" ? v.trim() : "");
const asAssertion = (v: unknown): AssertionType | null => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return (ASSERTION_TYPES as string[]).includes(s) ? (s as AssertionType) : null;
};

/** Resolve one model response into propositions.
 *
 *  PURE, and deliberately the strictest part of this file. The model chooses an
 *  assertion type per proposition, and that choice decides which of its own
 *  citations are admissible: the matrix is re-applied per proposition, so a model
 *  that reaches for evidence its claim cannot use loses that evidence rather than
 *  the platform gaining a claim it cannot support. A proposition left with
 *  nothing is dropped. */
export function parsePropositions(opts: {
  raw: { propositions?: RawProposition[] } | null;
  needId: string;
  frame: EvidenceFrame;
  shown: AdmittedForClaim[];
}): CandidateProposition[] {
  const out: CandidateProposition[] = [];

  (opts.raw?.propositions ?? []).forEach((p, i) => {
    const statement = str(p?.statement);
    const assertion = asAssertion(p?.assertion);
    if (!statement || !assertion) return;

    // An assertion type the frame cannot support is discarded whatever it says.
    // The menu told the model this; enforcing it here is what makes it true.
    if (!opts.frame.supportable.includes(assertion)) return;

    const isNull = assertion === "absence";
    const indices = Array.isArray(p?.evidence)
      ? [...new Set(p.evidence.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < opts.shown.length))]
      : [];

    // Re-project for THIS proposition's assertion type. A citation admissible for
    // a description may be inadmissible for the cause the model chose to argue.
    const admissibleIds = new Set(projectFor(opts.frame, assertion).admitted.map(a => a.evidenceId));
    const citations: AdmittedForClaim[] = [];
    const rejectedCitations: CandidateProposition["rejectedCitations"] = [];
    for (const idx of indices) {
      const item = opts.shown[idx];
      if (admissibleIds.has(item.evidenceId)) { citations.push(item); continue; }
      rejectedCitations.push({
        evidenceId: item.evidenceId,
        reason: compatibility(assertion, item.contribution).constraint
          ?? "This kind of evidence cannot support this kind of claim.",
      });
    }

    // A proposition with nothing behind it is a guess. An absence proposition is
    // the one exception: its grounds are the search, not the evidence.
    if (!isNull && citations.length === 0) return;

    out.push({
      id: `${opts.needId}:p${i}`,
      needId: opts.needId,
      statement,
      assertion,
      scope: str(p?.scope),
      warrant: str(p?.warrant),
      reading: str(p?.reading) || `Reading ${i + 1}`,
      citations,
      rejectedCitations,
      isNull,
    });
  });

  return out;
}

/** The items put in front of the model: the most strongly bearing first, bounded.
 *  Unjudged items sort last rather than being treated as irrelevant, because null
 *  bearing is unknown and not zero. */
export function shownFor(frame: EvidenceFrame): AdmittedForClaim[] {
  // The descriptive projection is the widest admissible set the matrix allows:
  // every contribution kind can describe something, so this is the frame minus
  // only what the design's method verdict ruled out. Showing the model evidence
  // its own design excluded would invite claims that then get stripped at parse
  // time, which reads as the platform changing its mind.
  //
  // Admissibility here is the descriptive baseline and is re-resolved per
  // proposition once the model has chosen what kind of claim it is making.
  return [...projectFor(frame, "descriptive").admitted]
    .sort((a, b) => (b.bearing ?? -1) - (a.bearing ?? -1))
    .slice(0, MAX_SHOWN);
}

// ── The one call ─────────────────────────────────────────────────────────────

/** Propose the rival readings of one Information Need's evidence.
 *
 *  Never persists, never assesses, never selects. The route decides storage and
 *  the assessment layer decides worth, exactly as the engine this replaces
 *  separated generation from storage. */
export async function formPropositions(opts: {
  need: { id: string; need: string; aspect: string };
  frame: EvidenceFrame;
  lens?: string;
}): Promise<PropositionSet> {
  const base: PropositionSet = {
    needId: opts.need.id, need: opts.need.need, propositions: [],
    examined: opts.frame.examined, disconfirmed: false,
  };

  // Nothing examined is an OPEN question, not an absence finding. The platform
  // must not claim to have looked when it has not (compatibility-matrix §7).
  if (opts.frame.examined === 0) return base;

  const shown = shownFor(opts.frame);
  const raw = await completeJSON<{ propositions?: RawProposition[] }>({
    prompt: buildFormationPrompt({
      need: opts.need.need, aspect: opts.need.aspect, lens: opts.lens ?? "",
      frame: opts.frame, shown,
    }),
    maxTokens: 2000,
  });

  return { ...base, propositions: parsePropositions({ raw, needId: opts.need.id, frame: opts.frame, shown }) };
}
