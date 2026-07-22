// The Conversation Intelligence Strategy — the research design that PRODUCES the
// searches, rather than starting from them.
//
// Conversation Intelligence must not begin with a search box. It begins with the
// commission. This analyst reasons from the engagement (decision, commercial
// objective, strategic tension, decisive factors) and decides:
//
//   what DIRECT evidence is worth attempting (and whether it plausibly exists)
//   what COMPARATIVE evidence is needed to benchmark
//   what STRATEGIC evidence is needed to explain the market and audience
//   which searches would actually obtain each of those
//
// Searches are OUTPUTS of this design, each answering a stated evidence
// requirement, and each inheriting the relevance test of its Evidence Role
// (lib/evidence-role.ts).
//
// The hardest and most valuable instruction here is HONESTY ABOUT SUPPLY. The
// FedEx work proved the point empirically: 821 collected conversations yielded
// zero genuine direct evidence, because a logistics sponsor's Champions League
// activity generates almost no unprompted fan conversation. A senior consultant
// says that up front and redirects the effort, rather than proposing a futile
// direct search and reporting failure later.
import { completeJSON } from "@/lib/intelligence/openai";
import { IntelligenceError } from "@/lib/intelligence/types";
import { stripEmDash } from "@/lib/strip-em-dash";
import { type EvidenceRole, EVIDENCE_ROLES, asEvidenceRole, EVIDENCE_ROLE_DESCRIPTION } from "@/lib/evidence-role";
import type { EngagementContext } from "@/lib/engagement-context";
import type { Brief } from "@/lib/brief";

const MODEL = "gpt-4o";

// How much evidence this requirement is realistically likely to yield. Recorded
// so the design is honest before collection, not after.
export type ExpectedSupply = "high" | "moderate" | "low" | "none";
const SUPPLIES: ExpectedSupply[] = ["high", "moderate", "low", "none"];

export type ProposedSearch = {
  name: string;              // what this search is called
  intent: string;            // what it is trying to surface
  primary_entity: string | null; // the anchor the relevance test judges against
  keywords: string[];        // seed terms
  platforms: string[];       // where this conversation actually happens
  expected_supply: ExpectedSupply;
};

export type EvidenceRequirement = {
  role: EvidenceRole;
  requirement: string;       // the evidence this commission needs in this role
  why_it_matters: string;    // how it serves the decision on the table
  expected_supply: ExpectedSupply;
  supply_note: string;       // honest reasoning about whether it exists to be found
  searches: ProposedSearch[];
};

export type EvidenceStrategy = {
  summary: string;                 // the strategy, stated plainly
  requirements: EvidenceRequirement[];
  not_worth_attempting: string[];  // what we deliberately will NOT chase, and why
  generated_at: string | null;
  model: string | null;
};

export type EvidenceStrategyInput = {
  researchQuestion: string | null;
  context: EngagementContext | null;
  brief: Brief | null;
};

function serialiseCommission(input: EvidenceStrategyInput): string {
  const c = input.context, b = input.brief;
  const line = (l: string, v: string | null | undefined) => (v && v.trim() ? `- ${l}: ${v.trim()}` : "");
  return [
    line("Research question", input.researchQuestion),
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

function buildPrompt(input: EvidenceStrategyInput): string {
  return `You are a senior research consultant designing the CONVERSATION INTELLIGENCE STRATEGY for an engagement. You are not choosing keywords. You are deciding what evidence this commission actually needs, what kind of evidence it is, and whether it can realistically be obtained. The searches are the OUTPUT of that thinking, never the starting point.

THE COMMISSION:
${serialiseCommission(input) || "- (thin commission; reason from the research question alone)"}

THE THREE EVIDENCE ROLES. Every requirement must be one of these, and each is judged by a different relevance test when collected:
- DIRECT: ${EVIDENCE_ROLE_DESCRIPTION.direct}
- COMPARATIVE: ${EVIDENCE_ROLE_DESCRIPTION.comparative}
- STRATEGIC: ${EVIDENCE_ROLE_DESCRIPTION.strategic}

HOW TO THINK, in order:
1. What does answering the research question actually REQUIRE us to learn? Break the commission into evidence requirements, not topics.
2. For each requirement, which ROLE supplies it? Evidence about the client is direct; evidence about rivals or comparable campaigns is comparative; evidence about how the market or audience behaves is strategic.
3. BE HONEST ABOUT SUPPLY. This is the most important judgement you make. Ask whether this evidence plausibly EXISTS in public conversation before proposing a search for it. Unprompted public conversation about a sponsor is usually scarce, especially for a B2B or logistics brand: audiences talk about the football, not the sponsor. A competition generating enormous conversation volume does NOT mean its sponsors do. If direct evidence is unlikely to exist, say so plainly, set expected_supply to "low" or "none", and shift the weight of the design onto the roles that CAN supply evidence. Do not propose a search you would be unwilling to defend to the client.
4. Only then propose searches. Each must answer a stated requirement, name what it is trying to surface, and be specific enough to run.

Rules:
- 2 to 5 requirements. Cover the roles that genuinely serve this commission; do NOT force all three if one has no supply, and do not pad.
- 1 to 3 searches per requirement, fewer where supply is low. A requirement with expected_supply "none" should have NO searches.
- primary_entity is the anchor the relevance test judges against: the client for direct, the named comparator for comparative, and usually null for strategic.
- COMPARATIVE SEARCHES MUST NAME A REAL COMPARATOR. Do not propose a generic "successful sponsorships" search: it collects noise and the comparative relevance test has nothing to judge against. Identify the actual brands or campaigns worth benchmarking against in this market (real, named sponsors of this competition or genuinely comparable properties), and propose ONE search per named comparator with that brand as primary_entity.
- keywords: 3 to 8 concrete seed terms. Never a generic word on its own ("sponsorship", "fan engagement", "campaigns"). Anchor each term to a named brand, campaign, property or a specific behaviour, so the search cannot match general match chatter.
- platforms: choose from Reddit, YouTube, News. Pick where this conversation genuinely happens, not all of them by default.
- not_worth_attempting: name what you have deliberately decided NOT to chase and why. An empty list means you believe everything is worth attempting, which is rare and should be justified.
- VOICE: plain, confident consultant prose. No hedging, no filler, no mention of AI or prompts. PUNCTUATION: use commas; NEVER use em-dashes or any long dash; always a comma instead.

Return ONLY valid JSON:
{
  "summary": "2-4 sentences: the evidence strategy for this commission and where its weight sits.",
  "requirements": [
    { "role": "direct|comparative|strategic",
      "requirement": "the evidence this commission needs",
      "why_it_matters": "how it serves the decision",
      "expected_supply": "high|moderate|low|none",
      "supply_note": "honest reasoning on whether this evidence exists to be found",
      "searches": [ { "name": "...", "intent": "...", "primary_entity": "..."|null, "keywords": ["..."], "platforms": ["..."], "expected_supply": "high|moderate|low|none" } ] }
  ],
  "not_worth_attempting": ["what we will not chase, and why"]
}`;
}

const clean = (v: unknown): string => stripEmDash(typeof v === "string" ? v.trim() : "");
const nullable = (v: unknown): string | null => clean(v) || null;
const strList = (v: unknown, max = 8): string[] =>
  (Array.isArray(v) ? v : []).map(clean).filter(Boolean).slice(0, max);
const supply = (v: unknown): ExpectedSupply => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return (SUPPLIES as string[]).includes(s) ? (s as ExpectedSupply) : "moderate";
};

function parseSearch(raw: unknown): ProposedSearch | null {
  const r = raw as Record<string, unknown> | null;
  const name = clean(r?.name);
  if (!name) return null;
  return {
    name,
    intent: clean(r?.intent),
    primary_entity: nullable(r?.primary_entity),
    keywords: strList(r?.keywords),
    platforms: strList(r?.platforms, 4),
    expected_supply: supply(r?.expected_supply),
  };
}

function parseRequirement(raw: unknown): EvidenceRequirement | null {
  const r = raw as Record<string, unknown> | null;
  const requirement = clean(r?.requirement);
  if (!requirement) return null;
  const role = asEvidenceRole(r?.role);
  const expected = supply(r?.expected_supply);
  return {
    role,
    requirement,
    why_it_matters: clean(r?.why_it_matters),
    expected_supply: expected,
    supply_note: clean(r?.supply_note),
    // A requirement with no expected supply must not carry searches: the design
    // says so rather than proposing work it does not believe in.
    searches: expected === "none" ? [] : (Array.isArray(r?.searches) ? r.searches : [])
      .map(parseSearch).filter((s): s is ProposedSearch => !!s).slice(0, 3),
  };
}

export async function analyseEvidenceStrategy(input: EvidenceStrategyInput): Promise<EvidenceStrategy> {
  if (!input.researchQuestion?.trim() && !input.context?.decision?.trim()) {
    throw new IntelligenceError(422, "A research question or a commissioned engagement is needed before designing the evidence strategy.");
  }

  const raw = await completeJSON<Record<string, unknown>>({
    prompt: buildPrompt(input), model: MODEL, maxTokens: 2200, temperature: 0.3,
  });

  const requirements = (Array.isArray(raw.requirements) ? raw.requirements : [])
    .map(parseRequirement).filter((r): r is EvidenceRequirement => !!r).slice(0, 5);

  // Keep the roles in a stable, readable order: direct, comparative, strategic.
  requirements.sort((a, b) => EVIDENCE_ROLES.indexOf(a.role) - EVIDENCE_ROLES.indexOf(b.role));

  return {
    summary: clean(raw.summary),
    requirements,
    not_worth_attempting: strList(raw.not_worth_attempting, 5),
    generated_at: new Date().toISOString(),
    model: MODEL,
  };
}
