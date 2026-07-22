// Orient — the FIRST stage of commissioning (docs/commissioning-journey.md). Before
// Fanometrix reads any document closely, it orients itself to the engagement, the
// way a senior strategist does when handed a new piece of work. It reads everything
// at ALTITUDE, not in detail, and answers: what world am I entering? Who commissioned
// this, and for whom? What decision, what outcome, what market? What do I actually
// have in front of me, and what's conspicuously missing?
//
// The output, the Engagement Context, is the standing LENS for every later stage. It
// is produced BEFORE Interpret (the reframe + understanding), never as a by-product
// of it. This separation is the whole point: get the orientation right first, and the
// interpretation cannot wander (the Adidas failure was an orientation error, a
// European pitch read as a North American market problem).
import { completeJSON } from "@/lib/intelligence/openai";
import { IntelligenceError } from "@/lib/intelligence/types";
import { stripEmDash } from "@/lib/strip-em-dash";
import {
  type EngagementContext, type ContextConfidence, type MaterialType, type MaterialItem,
} from "@/lib/engagement-context";

const MODEL = "gpt-4o";

// The situation is the assembled raw material (the primary description plus labelled
// fragments and document text). orientNote is the user correcting our orientation in
// plain language ("this is European, not global"), which re-orients everything.
export type OrientInput = { situation: string; orientNote?: string | null };

function buildPrompt(situation: string, orientNote?: string | null): string {
  const note = orientNote?.trim();
  return `You are a senior strategy consultant at Fanometrix (sport, fan and brand). You have just been handed a new engagement. Before you read anything closely, you ORIENT yourself, the way an experienced strategist does when they walk into a room: what world am I entering, who is really asking, and to decide what. You are NOT interpreting the brief yet. You are working out what this engagement IS.

THE SITUATION (everything you've been given, read it all together, at altitude):
"""
${situation.slice(0, 14000)}
"""
${note ? `\nYOU'VE JUST BEEN CORRECTED ON YOUR ORIENTATION: "${note}"\nRe-orient. Take this as ground truth and rebuild the context around it. Do not defend the old orientation.\n` : ""}
Work out the ENGAGEMENT CONTEXT. Read the WHOLE situation together, and weight the signals a real strategist would:
- A FORWARDED EMAIL or an aside often reveals who is really commissioning this and why, more than the brief does.
- WHOSE document is this? A client brief and an agency pitch deck are not the same thing: a pitch argues a case, so trust its framing less than a client's own words.
- MARKET / GEOGRAPHY is the single most dangerous thing to assume. If the material points to a specific market (a league, a region, a tournament, a country), pin it. Never default to a global or a home-market reading unless the material genuinely says so. Getting this wrong corrupts everything downstream.
- What is CONTEXT (a tournament as backdrop, a season, a rival's move) versus what is the actual ASSIGNMENT.

Fill each field. Use null for anything the situation genuinely does not support, do NOT invent an organisation, an agency, a market or an audience that isn't there.
- engagement_type: the kind of work this is, in a few words (e.g. "Agency pitch support", "Brand strategy", "Sponsorship evaluation", "Partnership planning"). Infer it from the situation.
- organisation: the brand/organisation the work is ultimately ABOUT (e.g. Adidas).
- commissioner: who ENGAGED Fanometrix, the party who commissioned this work and to whom we answer. This is a DIFFERENT concept from the organisation. When an agency is running the engagement (e.g. M&C Saatchi, a pitching agency, a consultancy), the AGENCY is the commissioner, not the brand. Only name the brand here if the brand itself directly commissioned us. If you cannot tell who engaged us, use null, do NOT just repeat the organisation.
- decision: the EXECUTIVE decision the stakeholders must make, the boardroom choice everything downstream exists to support (e.g. "whether to invest in the Backyard Legends campaign", "which of two markets to lead with", "renew the sponsorship or walk"). It is a business decision with money or direction riding on it, NEVER a research question or a description of the output. If your sentence starts with "understand", "explore" or "find out", it is wrong, rewrite it as the decision that finding out would inform.
- commercial_objective: the commercial outcome they are chasing.
- market: the geography / market scope. Be specific and literal to the material. This field has its own line because it is the one most often wrongly assumed.
- intended_audience: who the eventual output must speak to (fans, a board, a pitch panel, a specific segment).
- available_materials: an inventory of what you were actually given. One entry per distinct piece, each { "label": short name, "type": one of [client_brief, agency_pitch, email, meeting_notes, existing_research, proposal, commercial, concern, described, other], "note": one line on what it tells you or how far to trust it }.
- outstanding_questions: professional diligence, the things you would want resolved BEFORE you'd recommend anything. Phrase each as a sharp question a senior consultant would actually raise, not a note about a "missing field" (0-4 items). Empty if you'd be comfortable proceeding.

STRATEGIC TENSION (the centre of gravity). Name the single commercial CONFLICT at the heart of this engagement, the bind the organisation is caught in, with BOTH sides in view. Not a problem statement, a genuine tension: "X, and yet Y". E.g. "Adidas owns the awareness (68% recall) but not the preference (22% vs Nike's 41%), so every euro spent on visibility widens a credibility gap it hasn't closed." This is the thread the whole engagement will pull on, so make it specific and true to THIS material, never generic. Use null only if the situation is too thin to find one.

DECISIVE FACTORS (weighting, the most important judgement you make here). Do NOT treat everything you've inferred as equally important. Name the ONE or TWO factors most likely to DETERMINE whether this engagement succeeds or fails, the things that, if they go wrong, sink it regardless of everything else. Not a list of everything that matters, the pivotal few. Each a short, sharp phrase a partner would circle on the page. E.g. "Proving the campaign moves preference, not just reach" or "Winning the European board's trust inside six weeks". Give 1, ideally, or at most 2. Everything else becomes supporting context beneath these.

SIGNALS ("why I'm seeing it this way"). Give 2 to 4 plain-language reasons that name the SPECIFIC thing in the material that led you here, so the reader can validate your interpretation at a glance. Each names a concrete signal (a number, an exact phrase, an aside, who wrote what) and what it told you. E.g. "The brand lead's email frames this as the deck that unlocks the board budget, so the real decision is investment, not messaging." This is transparency, NOT chain-of-thought, keep each to one sentence.

ORIENTATION (a plain statement of the engagement): write ONE or TWO plain sentences that STATE what this engagement is, the way a consultant confirms the brief before starting work. Name the organisation, the market and the real decision. Confident and definitional, NOT a question, do not ask "have I got that right" or narrate that you are checking. Unmistakably about THIS engagement, never generic. Example of the SHAPE (different work, model the style not the content): "A partner pitch for Adidas across its core European markets, the World Cup as backdrop rather than subject, and the decision on the table is whether Backyard Legends can move preference against Nike."

CONFIDENCE, in the CONTEXT itself (not in any read of the problem):
- "high": you clearly know who, for whom, what decision and what market.
- "medium": you can orient but one of those is genuinely unclear.
- "low": the situation is thin and you're still getting your bearings.

PUNCTUATION: use commas; NEVER use em-dashes or any long dash; always a comma instead. VOICE: confident, concrete, no hedging, no throat-clearing. Ground everything in the situation; invent nothing.

Return ONLY valid JSON:
{
  "orientation": "one or two sentences, spoken back",
  "strategic_tension": "the commercial conflict at the heart, both sides named"|null,
  "decisive_factors": ["the 1-2 factors most likely to decide success"],
  "engagement_type": "..."|null, "organisation": "..."|null, "commissioner": "..."|null,
  "decision": "the executive decision to be made"|null, "commercial_objective": "..."|null, "market": "..."|null, "intended_audience": "..."|null,
  "available_materials": [ { "label": "...", "type": "client_brief|agency_pitch|email|meeting_notes|existing_research|proposal|commercial|concern|described|other", "note": "..." } ],
  "outstanding_questions": ["a sharp question to resolve before recommending"],
  "signals": ["a concrete signal from the material and what it told you"],
  "confidence": "high|medium|low"
}`;
}

// ── defensive parsing ─────────────────────────────────────────────────────────
const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const nullable = (v: unknown): string | null => { const s = stripEmDash(clean(v)); return s || null; };
const MATERIAL_TYPES: MaterialType[] = [
  "client_brief", "agency_pitch", "email", "meeting_notes", "existing_research", "proposal", "commercial", "concern", "described", "other",
];
const materialType = (v: unknown): MaterialType => { const s = clean(v).toLowerCase(); return (MATERIAL_TYPES as string[]).includes(s) ? (s as MaterialType) : "other"; };

function parseMaterial(raw: unknown): MaterialItem | null {
  const r = raw as Record<string, unknown> | null;
  const label = stripEmDash(clean(r?.label));
  if (!label) return null;
  return { label, type: materialType(r?.type), note: nullable(r?.note) };
}

export async function analyseEngagementContext(input: OrientInput): Promise<EngagementContext> {
  if (!input.situation?.trim() || input.situation.trim().length < 12) {
    throw new IntelligenceError(422, "Tell me a little more about the situation and I'll get oriented.");
  }

  const raw = await completeJSON<Record<string, unknown>>({
    prompt: buildPrompt(input.situation, input.orientNote), model: MODEL, maxTokens: 1200, temperature: 0.3,
  });

  const conf = clean(raw.confidence).toLowerCase();
  const confidence: ContextConfidence = conf === "high" || conf === "medium" || conf === "low" ? (conf as ContextConfidence) : "medium";
  const materials = (Array.isArray(raw.available_materials) ? raw.available_materials : [])
    .map(parseMaterial).filter((m): m is MaterialItem => !!m).slice(0, 8);
  const strList = (v: unknown, max: number) => (Array.isArray(v) ? v : []).map(clean).filter(Boolean).map(stripEmDash).slice(0, max);

  return {
    orientation: stripEmDash(clean(raw.orientation)),
    strategic_tension: nullable(raw.strategic_tension),
    decisive_factors: strList(raw.decisive_factors, 2),
    engagement_type: nullable(raw.engagement_type),
    organisation: nullable(raw.organisation),
    commissioner: nullable(raw.commissioner),
    decision: nullable(raw.decision),
    commercial_objective: nullable(raw.commercial_objective),
    market: nullable(raw.market),
    intended_audience: nullable(raw.intended_audience),
    available_materials: materials,
    outstanding_questions: strList(raw.outstanding_questions, 4),
    signals: strList(raw.signals, 4),
    confidence,
    generated_at: new Date().toISOString(),
    model: MODEL,
  };
}
