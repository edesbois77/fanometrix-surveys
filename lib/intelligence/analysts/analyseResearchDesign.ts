// The Research Design analyst — decides WHAT EVIDENCE IS WORTH COLLECTING, before
// any collecting begins (lib/research-design.ts).
//
// It reasons from the commission (decision, commercial objective, strategic
// tension, decisive factors, audience, market) and produces the evidence strategy:
// what each Evidence Role must supply, whether that evidence plausibly EXISTS, the
// methods that could obtain it, and only then the concrete searches.
//
// TWO CONCEPTS, kept separate: an Evidence Requirement states WHAT we need to
// learn; its Evidence Strategy states HOW we propose to obtain it.
//
// SOURCE-AGNOSTIC: a requirement's strategy owns RECOMMENDED RESEARCH METHODS
// (conversation, survey, Research Library, industry reports, academic research,
// news, trends), not searches, and usually recommends more than one. Only the
// conversation method carries concrete proposals today; the others are still
// reasoned about, so the design is a programme view rather than a listening plan.
//
// The most important instruction is HONESTY ABOUT AVAILABILITY, learned the
// expensive way: 821 collected FedEx conversations yielded zero genuine direct
// evidence, because a logistics sponsor's Champions League activity generates
// almost no unprompted fan conversation. A requirement whose evidence does not
// exist gets no searches, and says so.
import { completeJSON } from "@/lib/intelligence/openai";
import { IntelligenceError } from "@/lib/intelligence/types";
import { stripEmDash } from "@/lib/strip-em-dash";
import { asEvidenceRole, EVIDENCE_ROLE_DESCRIPTION } from "@/lib/evidence-role";
import { EVIDENCE_ROLES } from "@/lib/evidence-role";
import type { MethodFit } from "@/lib/information-needs";
import {
  type ResearchDesign, type EvidenceRequirement, type MethodRecommendation,
  type ProposedSearch, type Comparator, type EvidenceAvailability, type ResearchMethod,
  RESEARCH_METHODS, RESEARCH_METHOD_LABEL, RESEARCH_METHOD_DESCRIPTION,
} from "@/lib/research-design";
import type { EngagementContext } from "@/lib/engagement-context";
import type { Brief } from "@/lib/brief";

const MODEL = "gpt-4o";

const AVAILABILITY: EvidenceAvailability[] = ["high", "moderate", "low", "none"];
const FITS: MethodFit[] = ["primary", "supporting", "conditional", "not_suitable"];

export type ResearchDesignInput = {
  researchQuestion: string | null;
  researchObjective: string | null;
  context: EngagementContext | null;
  brief: Brief | null;
};

function serialiseCommission(input: ResearchDesignInput): string {
  const c = input.context, b = input.brief;
  const line = (l: string, v: string | null | undefined) => (v && v.trim() ? `- ${l}: ${v.trim()}` : "");
  return [
    line("Research question", input.researchQuestion),
    line("Research objective", input.researchObjective),
    line("Engagement type", c?.engagement_type),
    line("Organisation", c?.organisation ?? b?.client),
    line("Commissioned by", c?.commissioner ?? b?.commissioned_by),
    line("Campaign", b?.campaign),
    line("The decision the client must make", c?.decision),
    line("Commercial objective", c?.commercial_objective),
    line("Strategic tension", c?.strategic_tension),
    c?.decisive_factors?.length ? `- What will decide success: ${c.decisive_factors.join("; ")}` : "",
    line("Market", c?.market ?? b?.geography),
    line("Audience", c?.intended_audience ?? b?.audience),
    b?.objectives?.length ? `- Stated objectives: ${b.objectives.join("; ")}` : "",
  ].filter(Boolean).join("\n");
}

function buildPrompt(input: ResearchDesignInput): string {
  return `You are a senior research consultant writing the RESEARCH DESIGN for an engagement. Your job is to decide what evidence is worth collecting, BEFORE any collection begins. You are not choosing search terms. Searches are the last thing you decide and the smallest part of this.

THE COMMISSION:
${serialiseCommission(input) || "- (thin commission; reason from the research question alone)"}

THE THREE EVIDENCE ROLES. Every requirement is exactly one of these, and each is judged by a DIFFERENT relevance test when collected:
- DIRECT: ${EVIDENCE_ROLE_DESCRIPTION.direct}
- COMPARATIVE: ${EVIDENCE_ROLE_DESCRIPTION.comparative}
- STRATEGIC: ${EVIDENCE_ROLE_DESCRIPTION.strategic}

THE RESEARCH METHODS you may RECOMMEND. You are recommending HOW evidence should be gathered, and a requirement usually needs MORE THAN ONE. You are not selecting a single method.
${RESEARCH_METHODS.map(m => `- ${m} (${RESEARCH_METHOD_LABEL[m]}): ${RESEARCH_METHOD_DESCRIPTION[m]}`).join("\n")}
Give each recommended method a fit verdict of primary, supporting, conditional or not_suitable. ONLY the "conversation" method carries concrete searches; every other method gets a recommendation and rationale but no searches.

DO NOT DEFAULT BY ROLE. In particular, a STRATEGIC requirement must not automatically become trend analysis. Strategic evidence is often best served by the Research Library, industry and analyst reports, academic research on the underlying behaviour, news coverage, or unprompted conversation, depending entirely on what the requirement asks. Choose from the full list above on the merits of each requirement, and say why in the rationale.

EXPLAIN THE CHOICE, NOT JUST THE METHODS. A reader must understand why the primary method was chosen OVER the alternatives, not merely that each method has a use. The strategy rationale must carry that trade-off explicitly, e.g. "conversation cannot reach this because fans do not discuss sponsors unprompted, so the survey carries it and conversation only corroborates". Parallel justifications are not an explanation of a choice.

NAME WHAT YOU REJECTED. Where a method would be an obvious thing to try but genuinely will not work for this requirement, INCLUDE it with fit "not_suitable" and say plainly why. A rejected method that is explained is more useful to the client than a silent omission, and it shows the design considered it.

HOW TO THINK, in order:
1. What must we LEARN to answer the research question and serve the decision? Express these as evidence requirements, not topics.
2. Which ROLE supplies each? Evidence about the client is direct; about rivals or comparable campaigns is comparative; about how the market or audience behaves is strategic.
3. BE HONEST ABOUT AVAILABILITY. This is the most important judgement in the design. Ask whether this evidence plausibly EXISTS before proposing work to find it. Unprompted public conversation about a SPONSOR is usually scarce, especially for a B2B or logistics brand: audiences discuss the football, not the sponsor. A competition generating enormous conversation volume does NOT mean its sponsors do. Where evidence is scarce, say so, set expected_availability to "low" or "none", and move the weight of the design onto roles and methods that can actually supply evidence.
4. Choose methods per requirement. If conversation cannot answer it, say which method could (a survey measures what conversation cannot; documents and news carry what fans never discuss).
5. Only now propose conversation searches, each answering a stated requirement.

FIELD RULES:
- aspect: a short Title Case Research Aspect this requirement maps to (e.g. "Fan Value", "Brand Fit", "Activation Recall"). This is the SAME organising unit Analysis groups findings by, so keep it stable and reusable.
- information_needs: 1 to 4 answerable sub-questions this requirement covers, phrased as questions.
- comparators: for COMPARATIVE requirements ONLY, name real, specific brands or properties worth benchmarking against, each with the reason it earns its place. Name actual sponsors of this competition or genuinely comparable properties. Never invent a brand and never list a company that is not really involved. Empty array for direct and strategic requirements.
- COMPARATIVE SEARCHES MUST NAME A REAL COMPARATOR as primary_entity, one search per comparator. A generic "successful sponsorships" search collects noise and leaves the comparative relevance test with nothing to judge against.
- keywords: 3 to 8 concrete seed terms. Never a generic word on its own ("sponsorship", "fan engagement", "campaigns"). Anchor every term to a named brand, campaign, property or specific behaviour, so a search cannot match general match chatter.
- platforms: choose from Reddit, YouTube, News. Pick where this conversation genuinely happens, not all of them by default.
- markets / languages: take them from the commission's market where stated (e.g. market "UK, Germany" gives markets ["GB","DE"] and languages ["en","de"]). Use ISO-style codes. Default to ["GB"] and ["en"] only if the commission says nothing.
- A requirement with expected_availability "none" must have NO conversation searches.

Rules:
- 3 to 5 requirements. Cover the roles that genuinely serve this commission; do not force all three where one has no supply, and do not pad.
- 1 to 3 conversation searches per requirement, fewer where availability is low.
- not_worth_attempting: name what you have deliberately decided NOT to chase and why. This is a mark of a good design, not a failure.
- VOICE: plain, confident consultant prose. No hedging, no filler, no mention of AI or prompts. PUNCTUATION: use commas; NEVER use em-dashes or any long dash; always a comma instead.

SEPARATE THE TWO CONCEPTS. The requirement states WHAT we need to learn and carries no collection detail. Its evidence_strategy states HOW we propose to obtain it.

Return ONLY valid JSON:
{
  "research_objective": "the objective this design serves, in one sentence",
  "commercial_context": "what is commercially at stake, from the commission"|null,
  "strategy_summary": "2-4 sentences: the overall strategy and where its weight sits",
  "requirements": [
    { "role": "direct|comparative|strategic",
      "requirement": "what we need to learn", "why_it_matters": "how it serves the decision",
      "aspect": "Short Title Case", "information_needs": ["..."],
      "expected_availability": "high|moderate|low|none",
      "availability_note": "honest reasoning on whether this evidence exists",
      "evidence_strategy": {
        "rationale": "why this approach, INCLUDING why the primary method was chosen over the alternatives",
        "comparators": [ { "name": "...", "why": "..." } ],
        "recommended_methods": [ { "method": "${RESEARCH_METHODS.join("|")}",
                     "fit": "primary|supporting|conditional|not_suitable",
                     "rationale": "...",
                     "conversation_searches": [ { "name": "...", "intent": "...", "primary_entity": "..."|null, "keywords": ["..."], "platforms": ["..."], "markets": ["..."], "languages": ["..."], "expected_availability": "high|moderate|low|none" } ] } ]
      } }
  ],
  "not_worth_attempting": ["..."]
}`;
}

// ── defensive parsing ─────────────────────────────────────────────────────────
const clean = (v: unknown): string => stripEmDash(typeof v === "string" ? v.trim() : "");
const nullable = (v: unknown): string | null => clean(v) || null;
const strList = (v: unknown, max = 8): string[] => (Array.isArray(v) ? v : []).map(clean).filter(Boolean).slice(0, max);
const availability = (v: unknown): EvidenceAvailability => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return (AVAILABILITY as string[]).includes(s) ? (s as EvidenceAvailability) : "moderate";
};
const methodFit = (v: unknown): MethodFit => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return (FITS as string[]).includes(s) ? (s as MethodFit) : "supporting";
};
const researchMethod = (v: unknown): ResearchMethod | null => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return (RESEARCH_METHODS as string[]).includes(s) ? (s as ResearchMethod) : null;
};

function parseSearch(raw: unknown): ProposedSearch | null {
  const r = raw as Record<string, unknown> | null;
  const name = clean(r?.name);
  if (!name) return null;
  const markets = strList(r?.markets, 6);
  const languages = strList(r?.languages, 6);
  return {
    name, intent: clean(r?.intent),
    primary_entity: nullable(r?.primary_entity),
    keywords: strList(r?.keywords),
    platforms: strList(r?.platforms, 4),
    markets: markets.length ? markets : ["GB"],
    languages: languages.length ? languages : ["en"],
    expected_availability: availability(r?.expected_availability),
  };
}

function parseMethod(raw: unknown): MethodRecommendation | null {
  const r = raw as Record<string, unknown> | null;
  const method = researchMethod(r?.method);
  if (!method) return null;
  const rec: MethodRecommendation = { method, fit: methodFit(r?.fit), rationale: clean(r?.rationale) };
  if (method === "conversation") {
    rec.conversation_searches = (Array.isArray(r?.conversation_searches) ? r.conversation_searches : [])
      .map(parseSearch).filter((s): s is ProposedSearch => !!s).slice(0, 3);
  }
  return rec;
}

function parseComparator(raw: unknown): Comparator | null {
  const r = raw as Record<string, unknown> | null;
  const name = clean(r?.name);
  return name ? { name, why: clean(r?.why) } : null;
}

function parseRequirement(raw: unknown): EvidenceRequirement | null {
  const r = raw as Record<string, unknown> | null;
  const requirement = clean(r?.requirement);
  if (!requirement) return null;
  const role = asEvidenceRole(r?.role);
  const expected = availability(r?.expected_availability);
  // Tolerate the strategy arriving nested (correct) or flattened onto the
  // requirement (a model slip), so a good design is never lost to shape drift.
  const strat = (r?.evidence_strategy ?? r) as Record<string, unknown>;

  // Ordered by fit so the PRIMARY recommendation always leads. The model returns
  // them in arbitrary order, which buried the primary method behind a supporting
  // one on the page the user approves from.
  const recommended_methods = (Array.isArray(strat?.recommended_methods) ? strat.recommended_methods : [])
    .map(parseMethod).filter((m): m is MethodRecommendation => !!m)
    .sort((a, b) => FITS.indexOf(a.fit) - FITS.indexOf(b.fit))
    .slice(0, 6);

  // A requirement whose evidence does not exist must not carry searches: the
  // design refuses to commission work it does not believe in.
  if (expected === "none") for (const m of recommended_methods) if (m.conversation_searches) m.conversation_searches = [];

  // Direct and comparative relevance tests judge against a NAMED subject: direct
  // requires the client, comparative requires the comparator. A search with no
  // anchor has nothing to judge against and collects exactly the topic-overlap
  // noise this methodology exists to prevent, so it is dropped deterministically.
  // Strategic searches legitimately have no anchor.
  if (role !== "strategic") {
    for (const m of recommended_methods) {
      if (m.conversation_searches) m.conversation_searches = m.conversation_searches.filter(s => !!s.primary_entity);
    }
  }
  // Comparators belong to comparative requirements only.
  const comparators = role === "comparative"
    ? (Array.isArray(strat?.comparators) ? strat.comparators : []).map(parseComparator).filter((c): c is Comparator => !!c).slice(0, 6)
    : [];

  return {
    role, requirement,
    why_it_matters: clean(r?.why_it_matters),
    aspect: nullable(r?.aspect),
    information_needs: strList(r?.information_needs, 4),
    expected_availability: expected,
    availability_note: clean(r?.availability_note),
    evidence_strategy: { recommended_methods, comparators, rationale: clean(strat?.rationale) },
  };
}

export async function analyseResearchDesign(input: ResearchDesignInput): Promise<ResearchDesign> {
  if (!input.researchQuestion?.trim() && !input.context?.decision?.trim()) {
    throw new IntelligenceError(422, "A research question or a commissioned engagement is needed before designing the research.");
  }

  const raw = await completeJSON<Record<string, unknown>>({
    prompt: buildPrompt(input), model: MODEL, maxTokens: 3000, temperature: 0.3,
  });

  const requirements = (Array.isArray(raw.requirements) ? raw.requirements : [])
    .map(parseRequirement).filter((r): r is EvidenceRequirement => !!r).slice(0, 5);
  // Stable reading order: direct, comparative, strategic.
  requirements.sort((a, b) => EVIDENCE_ROLES.indexOf(a.role) - EVIDENCE_ROLES.indexOf(b.role));

  return {
    research_question: input.researchQuestion?.trim() || null,
    research_objective: nullable(raw.research_objective) ?? (input.researchObjective?.trim() || null),
    commercial_context: nullable(raw.commercial_context) ?? (input.context?.commercial_objective ?? null),
    strategy_summary: clean(raw.strategy_summary),
    requirements,
    not_worth_attempting: strList(raw.not_worth_attempting, 5),
    status: "draft",
    approved_at: null,
    approved_by: null,
    generated_at: new Date().toISOString(),
    model: MODEL,
  };
}
