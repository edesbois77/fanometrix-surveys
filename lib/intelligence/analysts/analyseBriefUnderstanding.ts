// The Overview commissioning analyst — reads a client brief (or a described
// challenge) and reflects back "Our Understanding" of the business problem
// (docs/overview-page.md). It does NOT extract fields like a parser; it reflects
// WITH INSIGHT — restating the problem sharper than it was given, distinguishing
// what the client STATED from what we INFERRED, proposing the research question,
// and surfacing tensions to resolve. Method-neutral: it never mentions surveys,
// conversation searches or documents — those belong to the Research Design.
import { completeJSON } from "@/lib/intelligence/openai";
import { IntelligenceError } from "@/lib/intelligence/types";
import { stripEmDash } from "@/lib/strip-em-dash";
import {
  type ProjectUnderstanding, type Sourced, type SourcedList, type Provenance,
  type UnderstandingTension,
} from "@/lib/understanding";
import type { EngagementContext } from "@/lib/engagement-context";

const MODEL = "gpt-4o";

export type BriefInput = {
  briefText: string;                 // extracted brief, or the described challenge
  context?: EngagementContext | null; // the lens from Orient — read the brief through it
  projectName?: string | null;
  existingQuestion?: string | null;  // any research question already on the project
  existingObjective?: string | null;
  sourceLabel?: string | null;       // filename or "Described challenge"
};

function serialiseLens(c: EngagementContext): string {
  const line = (label: string, v: string | null) => (v ? `- ${label}: ${v}` : "");
  return [
    line("Engagement", c.engagement_type),
    line("Organisation", c.organisation),
    line("Commissioned by", c.commissioner),
    line("Market / geography", c.market),
    line("Intended audience", c.intended_audience),
    line("Decision on the table", c.decision),
    line("Commercial objective", c.commercial_objective),
    line("Strategic tension (the thread)", c.strategic_tension),
    c.decisive_factors.length ? `- What will decide success: ${c.decisive_factors.join("; ")}` : "",
  ].filter(Boolean).join("\n");
}

function buildPrompt(input: BriefInput): string {
  const ctx = [
    input.projectName?.trim() ? `Engagement: ${input.projectName.trim()}` : "",
    input.existingQuestion?.trim() ? `A research question already noted: "${input.existingQuestion.trim()}"` : "",
    input.existingObjective?.trim() ? `An objective already noted: "${input.existingObjective.trim()}"` : "",
  ].filter(Boolean).join("\n");

  const lens = input.context ? serialiseLens(input.context) : "";

  return `You are a senior researcher at Fanometrix, a research consultancy for sports & fan brands. A client has given you the brief below. Reflect back your understanding of their business problem the way an experienced consultant would in an opening meeting — demonstrating that you GET it, not parroting fields back.
${lens ? `\nYOU HAVE ALREADY ORIENTED YOURSELF. Read the brief THROUGH this settled engagement context, never outside it (if it says the market is Europe, your understanding is about Europe):\n${lens}\n` : ""}
${ctx ? ctx + "\n" : ""}CLIENT BRIEF (the only ground truth — never invent facts not supported here):
"""
${input.briefText.slice(0, 12000)}
"""

Do this:
1. REFLECT WITH INSIGHT. Write a short narrative (3-5 sentences) that restates the problem SHARPER than the brief did — name the real question underneath the stated ask, and the commercial tension in play. This is where seniority shows. Do not list fields in the narrative.
2. Fill the structured fields. For EACH, mark provenance:
   - "stated": the brief explicitly says it. Put a short citation in "source" (e.g. "brief" or a section/heading if identifiable), else null.
   - "inferred": you reasonably deduced it; it is NOT explicit. source = null.
3. PROPOSE the research question (provenance always "proposed") — a single, decision-shaped, fan/business-centred question the research should answer. It reframes the brief's ask into a researchable question.
4. Surface TENSIONS & ASSUMPTIONS — things the user should resolve before we plan (e.g. an unstated assumption, a conflation of two different objectives, an ambiguous audience). 0-4 of them. Empty if the brief is clean.

Rules:
- Ground everything in the brief. If a field is not addressed, mark it "inferred" with your best reasonable reading, or leave its value/values empty — never fabricate specifics (numbers, names, dates) that aren't supported.
- Be METHOD-NEUTRAL. Never mention surveys, conversation/social listening, document analysis, or any research method. This is about understanding the problem, not how to solve it.
- Keep values concise. Lists: 2-5 items each, omit rather than pad.
- PUNCTUATION: use commas; NEVER use em-dashes or any long dash in any text you write; always a comma instead.

Return ONLY valid JSON:
{
  "reflection": "the narrative",
  "business_challenge": { "value": "...", "provenance": "stated|inferred", "source": "..."|null },
  "objectives":        { "values": ["..."], "provenance": "stated|inferred", "source": "..."|null },
  "research_question": { "value": "...", "provenance": "proposed", "source": null },
  "target_audience":   { "value": "...", "provenance": "stated|inferred", "source": "..."|null },
  "markets":           { "values": ["..."], "provenance": "stated|inferred", "source": "..."|null },
  "deliverables":      { "values": ["..."], "provenance": "stated|inferred", "source": "..."|null },
  "constraints":       { "values": ["..."], "provenance": "stated|inferred", "source": "..."|null },
  "stakeholders":      { "values": ["..."], "provenance": "stated|inferred", "source": "..."|null },
  "tensions": [ { "kind": "tension|assumption", "message": "..." } ]
}`;
}

// ── defensive parsing ─────────────────────────────────────────────────────────
const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const PROVS: Provenance[] = ["stated", "inferred", "proposed"];
const prov = (v: unknown, fallback: Provenance): Provenance => {
  const s = clean(v).toLowerCase();
  return (PROVS as string[]).includes(s) ? (s as Provenance) : fallback;
};
const strList = (raw: unknown, max = 6): string[] =>
  (Array.isArray(raw) ? (raw as unknown[]).map(clean).filter(Boolean).map(stripEmDash) : []).slice(0, max);

function sourced(raw: unknown): Sourced {
  const r = raw as Record<string, unknown> | null;
  return { value: stripEmDash(clean(r?.value)), provenance: prov(r?.provenance, "inferred"), source: clean(r?.source) || null };
}
function sourcedList(raw: unknown): SourcedList {
  const r = raw as Record<string, unknown> | null;
  return { values: strList(r?.values), provenance: prov(r?.provenance, "inferred"), source: clean(r?.source) || null };
}
function parseTension(raw: unknown): UnderstandingTension | null {
  const r = raw as Record<string, unknown> | null;
  const message = clean(r?.message);
  if (!message) return null;
  return { kind: clean(r?.kind).toLowerCase() === "assumption" ? "assumption" : "tension", message: stripEmDash(message) };
}

export async function analyseBriefUnderstanding(input: BriefInput): Promise<ProjectUnderstanding> {
  if (!input.briefText?.trim() || input.briefText.trim().length < 20) {
    throw new IntelligenceError(422, "Add a bit more about the challenge (or upload a brief) so we can reflect it back.");
  }

  const raw = await completeJSON<Record<string, unknown>>({
    prompt: buildPrompt(input), model: MODEL, maxTokens: 1600, temperature: 0.3,
  });

  const rq = sourced(raw.research_question);
  return {
    reflection: stripEmDash(clean(raw.reflection)),
    business_challenge: sourced(raw.business_challenge),
    objectives: sourcedList(raw.objectives),
    research_question: { value: rq.value, provenance: "proposed", source: null },
    target_audience: sourced(raw.target_audience),
    markets: sourcedList(raw.markets),
    deliverables: sourcedList(raw.deliverables),
    constraints: sourcedList(raw.constraints),
    stakeholders: sourcedList(raw.stakeholders),
    tensions: (Array.isArray(raw.tensions) ? raw.tensions : []).map(parseTension).filter((t): t is UnderstandingTension => !!t).slice(0, 4),
    source_label: input.sourceLabel ?? null,
    generated_at: new Date().toISOString(),
    model: MODEL,
    confirmed: false,
    confirmed_at: null,
  };
}
