// The Brief analyst — a FACTUAL synthesis of the supplied material, no opinion. It
// records what the client actually asked for, distinct from the Engagement (what we
// think the real problem is). Its only job is to prove we have read the material
// accurately (docs/commissioning-journey.md). It NEVER interprets, reframes, or
// names a "real problem", that is the Engagement's job, not the Brief's.
import { completeJSON } from "@/lib/intelligence/openai";
import { IntelligenceError } from "@/lib/intelligence/types";
import { stripEmDash } from "@/lib/strip-em-dash";
import type { Brief } from "@/lib/brief";

const MODEL = "gpt-4o";

export type BriefFactsInput = { material: string };

function buildPrompt(material: string): string {
  return `You are recording THE BRIEF: a faithful, factual summary of the material a client has supplied. This is NOT analysis. Your only job is to show you have read and understood what they actually gave you, accurately and without spin.

THE MATERIAL:
"""
${material.slice(0, 14000)}
"""

Extract ONLY what the material states or requests. Hard rules:
- FACTUAL, never interpretive. Do NOT identify a "real problem", a tension, a risk, or what they "really" need. Do NOT give advice or a point of view. That is a different artefact.
- Only what is genuinely supported by the material. If something is not stated, use null (for single values) or an empty array (for lists). NEVER invent a client, a campaign, a market, a number, a deadline or a deliverable that is not there.
- Neutral, plain language. Report what they asked for in their terms.

Fields:
- client: the brand / organisation the work is for.
- commissioned_by: who supplied or commissioned the material (an agency, a team, a named person). May be the same as the client, or different (e.g. an agency acting for the brand). null if not stated.
- campaign: the named campaign, activation or initiative the brief concerns, if any. null if none is named.
- geography: the markets, regions or countries stated. If the material lists markets (e.g. "Markets: UK, Germany, France"), record them here verbatim, do not leave this null when markets are named.
- audience: the target audience as stated.
- objectives: what the client says they want to achieve, as stated (0-6).
- deliverables: the outputs / deliverables requested (0-6).
- constraints: stated timings, deadlines, budget, mandatories or limits (0-6).
- summary: the AI BRIEF SUMMARY, a neutral factual precis of the supplied material in 2 to 4 sentences. What was provided and what it asks for. No opinion, no reframing.

PUNCTUATION: use commas; NEVER use em-dashes or any long dash; always a comma instead.

Return ONLY valid JSON:
{
  "client": "..."|null, "commissioned_by": "..."|null, "campaign": "..."|null,
  "geography": "..."|null, "audience": "..."|null,
  "objectives": ["..."], "deliverables": ["..."], "constraints": ["..."],
  "summary": "the factual precis"
}`;
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const nullable = (v: unknown): string | null => { const s = stripEmDash(clean(v)); return s || null; };
const strList = (v: unknown, max = 6): string[] => (Array.isArray(v) ? v : []).map(clean).filter(Boolean).map(stripEmDash).slice(0, max);

export async function analyseBrief(input: BriefFactsInput): Promise<Brief> {
  if (!input.material?.trim() || input.material.trim().length < 12) {
    throw new IntelligenceError(422, "Give me a little more material and I'll record the brief.");
  }

  const raw = await completeJSON<Record<string, unknown>>({
    prompt: buildPrompt(input.material), model: MODEL, maxTokens: 1200, temperature: 0.1,
  });

  return {
    client: nullable(raw.client),
    commissioned_by: nullable(raw.commissioned_by),
    campaign: nullable(raw.campaign),
    geography: nullable(raw.geography),
    audience: nullable(raw.audience),
    objectives: strList(raw.objectives),
    deliverables: strList(raw.deliverables),
    constraints: strList(raw.constraints),
    summary: stripEmDash(clean(raw.summary)),
    generated_at: new Date().toISOString(),
    model: MODEL,
  };
}
