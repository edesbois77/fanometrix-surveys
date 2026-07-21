// Conversation Advisor — the config-time analyst that fronts Conversation
// Intelligence (docs/conversation-advisor.md). It promotes the old
// analyseSearchStrategy: instead of jumping straight to retrieval terms, it
// reasons like a research consultant —
//   1. a RECOMMENDATION (is Conversation Intelligence the right method? what can
//      it answer, what can't it, where should another method complement it?),
//   2. the RESEARCH THEMES (= Research Aspects) and the internal information
//      needs beneath each, with a method-fit verdict per need,
//   3. per-platform recommend / don't-recommend rationale,
//   4. honest limitations,
//   5. actionable CHALLENGES (split the study, hand off to Survey…),
// and ONLY THEN compiles the Search Strategy (keywords are an implementation
// detail). The engine reasons in recommendation STATES; the UI shows
// consultancy language (see lib/conversation-advisor.ts).
import { completeJSON } from "@/lib/intelligence/openai";
import { IntelligenceError } from "@/lib/intelligence/types";
import { PLATFORMS } from "@/lib/social-taxonomy";
import { analyseSearchStrategy } from "@/lib/intelligence/analysts/analyseSearchStrategy";
import {
  type ConversationAdvisorBriefing, type ConversationRecommendation, type InformationNeeds,
  type ResearchTheme, type InformationNeed, type PlatformRecommendation, type AdvisorChallenge,
  type RecommendationState, type MethodFit, type ComplementMethod, type ChallengeAction,
} from "@/lib/conversation-advisor";

const MODEL = "gpt-4o";

export type AdvisorInput = {
  researchQuestion: string;
  objective?: string | null;      // business challenge / commercial context (informs, not the question)
  projectName?: string | null;
  markets?: string[];
  languages?: string[];
  existingKeywords?: string[];
};

const PLATFORM_IDS = PLATFORMS.map(p => p.id);

function buildPrompt(input: AdvisorInput): string {
  const ctx = [
    `Research question (fan-centred — this is what the evidence must answer): "${input.researchQuestion.trim()}"`,
    input.objective?.trim() ? `Commercial context (informs audience & priorities — NOT the question): "${input.objective.trim()}"` : "",
    input.projectName?.trim() ? `Project: ${input.projectName.trim()}` : "",
    input.markets?.length ? `Markets: ${input.markets.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  return `You are an experienced conversation-research consultant at Fanometrix, a research consultancy for sports & fan brands. A researcher has brought you a research question. Advise them like a specialist — lead with a recommendation, be honest about what public-conversation evidence can and cannot do, and challenge the brief where a genuine specialist would.

${ctx}

CORE PRINCIPLE: never begin with keywords. Begin with the evidence required to answer the question. The durable unit is the INFORMATION NEED (an answerable sub-question about the world), never a search term.

Decide a recommendation STATE. Read the QUESTION's own objective — do not react to what conversations generically can't do.
- "proceed": the question asks WHAT/WHY/HOW fans think, feel, value, experience or react. Conversation evidence answers this end to end. THIS IS THE DEFAULT for fan-perception, sentiment, value, authenticity, frustration, motivation and experience questions. Most questions are this.
- "proceed_plus_complement": the question ALSO contains a SEPARATE, explicit quantification/measurement objective ("…and how many…", "…what % …", "…at what price…") alongside a qualitative one. Only then. Set complementary_method.
- "redirect": the question is PRIMARILY or ONLY a measurement/quantification/sizing question (how many, what %, willingness to pay, market size, ranking of prevalence). Recommend the better method.
- "reframe_first": the question bundles two or more DISTINCT research objectives that each deserve their own study. Lead with this.

HARD RULE — survey-complement discipline: do NOT recommend a survey (do NOT use proceed_plus_complement or an add_survey challenge) merely because conversations cannot produce percentages. That is always true and is NOT a reason. Add a survey ONLY when the RESEARCH QUESTION ITSELF asks to count, size, measure prevalence, or establish willingness to pay. A pure "what do fans value / why / how do they feel" question is "proceed" with NO survey and NO complement — say so plainly and confidently. (cannot_answer should still note the honest boundary, but that boundary must NOT trigger a survey recommendation on its own.)

METHOD-FIT per information need:
- "primary": conversations are the best available evidence.
- "supporting": conversations illustrate but can't settle it.
- "conditional": conversations become useful only AFTER another method establishes the vocabulary/structure (say which).
- "not_suitable": conversations will mislead if used to answer it — route elsewhere.

PLATFORM capability profiles (recommend from these ids ONLY: ${PLATFORM_IDS.join(", ")}). Judge each against THIS question — apply the profile, don't recite it:
- Reddit: deliberative depth, debate, the "why". Strong for values/frustrations/authenticity.
- YouTube: raw reaction and emotion in fans' own words.
- News: authoritative framing, precedent, the official narrative.
- Google Trends: momentum, salience and how interest CHANGES OVER TIME. RECOMMEND it when the question is about growth, decline, rising/falling interest, seasonality, or whether something is trending (e.g. "is interest in X growing?"). Mark it not-recommended only when the question needs the "why"/sentiment, which Trends cannot give.
- X (Twitter): fast reaction, real-time takes.
- Instagram, TikTok: visual/reaction; weaker for deliberation.
Include every id with a true/false verdict and a one-line reason. This is where your expertise shows.

CHALLENGE only where genuinely warranted (actionable, never blocking) — and NOT on a clean single-objective qualitative question (leave challenges empty then):
- two or more distinct objectives → type "reframe", action "split_studies".
- a genuine separate quantification objective in the question → type "method_handoff", action "add_survey" (with proceed_plus_complement) or "switch_method" (with redirect).
- an underspecified question (no audience/scope/brand) → type "sharpen", action "refine_question".

Return ONLY valid JSON:
{
  "recommendation": {
    "state": "proceed|proceed_plus_complement|reframe_first|redirect",
    "headline": "one-sentence consultant verdict in plain prose, no jargon",
    "rationale": "2-3 sentences: why Conversation Intelligence is (or isn't) the right method here",
    "can_answer": "what conversation evidence CAN establish for this question",
    "cannot_answer": "what it cannot establish",
    "complementary_method": "survey|document|news|interview" or null,
    "platforms": [ { "platform": "<one of the ids above>", "recommended": true|false, "rationale": "why / why not, in one sentence" } ],
    "limitations": ["honest boundary 1", "honest boundary 2"],
    "challenges": [ { "type": "reframe|method_handoff|sharpen", "message": "what you'd say to the researcher", "target_method": "survey|document|news|interview" or null, "action": "split_studies|add_survey|switch_method|refine_question", "action_label": "short button text e.g. Split into two studies" } ]
  },
  "themes": [
    { "aspect": "Short Title Case theme (a Research Aspect)", "description": "one line on what this theme covers",
      "needs": [ { "need": "an answerable sub-question about the world (NOT a keyword)", "method_fit": "primary|supporting|conditional|not_suitable", "rationale": "why conversations can/can't answer it" } ] }
  ]
}

Rules:
- Lead with the recommendation. Themes group the information needs into 3-5 meaningful aspects; each theme has 1-3 needs.
- Needs are questions about the world, never search strings, never brand keywords. (For a FedEx UCL sponsorship question, needs are "What do fans value from a sponsor's presence?" — not "FedEx".)
- Include EVERY platform id you have a view on, recommended true or false; do not silently omit the ones you'd avoid.
- challenges is an EMPTY array for a well-formed single-objective qualitative question. Most "proceed" questions have no challenges.
- Be honest in limitations and cannot_answer — restraint builds trust. If a need asks "how many / what %" or willingness to pay, mark THAT NEED not_suitable — but only escalate to a survey complement/redirect when quantification is part of the QUESTION's objective, per the HARD RULE above.`;
}

// ── defensive parsing ─────────────────────────────────────────────────────────
const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strList = (raw: unknown, max = 6): string[] =>
  (Array.isArray(raw) ? (raw as unknown[]).map(clean).filter(Boolean) : []).slice(0, max);

const STATES: RecommendationState[] = ["proceed", "proceed_plus_complement", "reframe_first", "redirect"];
const FITS: MethodFit[] = ["primary", "supporting", "conditional", "not_suitable"];
const METHODS: ComplementMethod[] = ["survey", "document", "news", "interview"];
const ACTIONS: ChallengeAction[] = ["split_studies", "add_survey", "switch_method", "refine_question"];

const oneOf = <T extends string>(v: unknown, allowed: T[], fallback: T): T => {
  const s = clean(v).toLowerCase();
  return (allowed as string[]).includes(s) ? (s as T) : fallback;
};
const oneOfOrNull = <T extends string>(v: unknown, allowed: T[]): T | null => {
  const s = clean(v).toLowerCase();
  return (allowed as string[]).includes(s) ? (s as T) : null;
};

function parseNeed(raw: unknown): InformationNeed | null {
  const r = raw as Record<string, unknown> | null;
  const need = clean(r?.need);
  if (!need) return null;
  return { need, method_fit: oneOf(r?.method_fit, FITS, "primary"), rationale: clean(r?.rationale) };
}

function parseTheme(raw: unknown): ResearchTheme | null {
  const r = raw as Record<string, unknown> | null;
  const aspect = clean(r?.aspect);
  if (!aspect) return null;
  const needs = (Array.isArray(r?.needs) ? r!.needs : []).map(parseNeed).filter((n): n is InformationNeed => !!n).slice(0, 4);
  if (!needs.length) return null;
  return { aspect, description: clean(r?.description), needs };
}

function parsePlatform(raw: unknown): PlatformRecommendation | null {
  const r = raw as Record<string, unknown> | null;
  const platform = clean(r?.platform);
  if (!PLATFORM_IDS.includes(platform as (typeof PLATFORM_IDS)[number])) return null;
  return { platform, recommended: r?.recommended === true, rationale: clean(r?.rationale) };
}

function parseChallenge(raw: unknown): AdvisorChallenge | null {
  const r = raw as Record<string, unknown> | null;
  const message = clean(r?.message);
  if (!message) return null;
  const type = oneOf(r?.type, ["reframe", "method_handoff", "sharpen"] as const, "sharpen");
  return {
    type, message,
    target_method: oneOfOrNull(r?.target_method, METHODS),
    action: oneOf(r?.action, ACTIONS, "refine_question"),
    action_label: clean(r?.action_label) || "Review",
  };
}

export async function analyseConversationAdvisor(input: AdvisorInput): Promise<ConversationAdvisorBriefing> {
  if (!input.researchQuestion?.trim()) {
    throw new IntelligenceError(422, "Add a research question so the Conversation Advisor can recommend an approach.");
  }

  const raw = await completeJSON<Record<string, unknown>>({
    prompt: buildPrompt(input), model: MODEL, maxTokens: 2200, temperature: 0.3,
  });

  const recRaw = (raw.recommendation ?? {}) as Record<string, unknown>;
  // De-dupe platforms by id, keeping the model's first verdict for each.
  const platforms: PlatformRecommendation[] = [];
  const seenPlatforms = new Set<string>();
  for (const p of (Array.isArray(recRaw.platforms) ? recRaw.platforms : []).map(parsePlatform)) {
    if (p && !seenPlatforms.has(p.platform)) { seenPlatforms.add(p.platform); platforms.push(p); }
  }

  const recommendation: ConversationRecommendation = {
    state: oneOf(recRaw.state, STATES, "proceed"),
    headline: clean(recRaw.headline),
    rationale: clean(recRaw.rationale),
    can_answer: clean(recRaw.can_answer),
    cannot_answer: clean(recRaw.cannot_answer),
    complementary_method: oneOfOrNull(recRaw.complementary_method, METHODS),
    platforms,
    limitations: strList(recRaw.limitations, 6),
    challenges: (Array.isArray(recRaw.challenges) ? recRaw.challenges : []).map(parseChallenge).filter((c): c is AdvisorChallenge => !!c).slice(0, 3),
    generated_at: new Date().toISOString(),
    model: MODEL,
    edited: false,
  };

  const information_needs: InformationNeeds = {
    themes: (Array.isArray(raw.themes) ? raw.themes : []).map(parseTheme).filter((t): t is ResearchTheme => !!t).slice(0, 6),
  };

  // The Search Strategy is the FINAL, subordinate output — reuse the existing
  // strategist so retrieval planning stays one code path. Keywords are derived
  // from this later (lib/search-strategy strategyKeywords), never typed by hand.
  const strategy = await analyseSearchStrategy({
    researchQuestion: input.researchQuestion,
    keywords: input.existingKeywords ?? [],
    entityType: null,
    markets: input.markets ?? [],
    languages: input.languages ?? [],
  });

  return { recommendation, information_needs, strategy };
}
