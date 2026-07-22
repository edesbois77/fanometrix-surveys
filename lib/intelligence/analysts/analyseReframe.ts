// The Reframe — the single most important moment in the platform (Slice 2 of the
// commissioning journey, docs/commissioning-journey.md). A senior strategist has
// oriented themselves to the engagement, then read the client's material in detail,
// and comes back with a POINT OF VIEW, not a summary, not extracted fields.
//
// This is the INTERPRET stage. It does NOT re-derive the engagement, that already
// happened in Orient (analyseEngagementContext). It RECEIVES the Engagement Context
// as its lens and reads the material through it. That separation is what stops the
// interpretation wandering: if the lens has already fixed the organisation, the
// market and the decision, the read cannot drift onto the wrong market (the Adidas
// failure).
//
// Three non-negotiables, enforced in the prompt: judgement before description;
// specificity (it must reference something unique from the material, if it could
// apply to another brand it has failed); and a position (willing to disagree with
// the brief). Optimise for insight, not extraction.
import { completeJSON } from "@/lib/intelligence/openai";
import { IntelligenceError } from "@/lib/intelligence/types";
import { stripEmDash } from "@/lib/strip-em-dash";
import type { EngagementContext } from "@/lib/engagement-context";

const MODEL = "gpt-4o";

export type ReframeConfidence = "high" | "medium" | "low";

export type Reframe = {
  confidence: ReframeConfidence;
  engagement_name: string;          // a real title for the work, never "Untitled"
  reframe: string;                  // judgement-first, specific, position-taking
  clarifying_questions: string[];   // the sharp questions to ask when unsure
  generated_at: string | null;
  model: string | null;
};

// The read is INTERPRETED THROUGH the context (the lens from Orient). A correction
// is the client pushing back on the read itself.
export type ReframeInput = { text: string; context: EngagementContext; correction?: string | null };

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
    c.decisive_factors.length ? `- What will decide success (weight your read here): ${c.decisive_factors.join("; ")}` : "",
  ].filter(Boolean).join("\n");
}

function buildPrompt(text: string, context: EngagementContext, correction?: string | null): string {
  const corrected = correction?.trim();
  return `You are a senior strategy consultant at Fanometrix (sport, fan and brand). You have ALREADY oriented yourself to this engagement. Here is your orientation, treat it as settled ground truth, your LENS. Do not re-litigate who the client is or what market this is, that is decided:

YOUR LENS (the engagement context):
${serialiseLens(context) || "- (thin, you're still getting your bearings)"}

Now you read the client's material in DETAIL, through that lens, and you set down what THIS ENGAGEMENT IS REALLY ABOUT: the shared definition of the problem you and the client are taking on together. This is the moment a senior consultant confirms the brief before starting work, not "here is my interpretation, do you agree?" but "here is the engagement we're solving." Confident, specific, and already ours. Everything you say must sit inside the lens above: if the lens says the market is Europe, you never reason about another market; if it names the real decision, your framing serves THAT decision.

THE MATERIAL (the only ground truth for detail, never invent facts not supported here):
"""
${text.slice(0, 12000)}
"""
${corrected ? `\nTHE CLIENT HAS JUST PUT YOU RIGHT / ADDED CONTEXT: "${corrected}"\nRework the definition around this, taking it as true. Do not restate the old version or narrate the change; simply state the engagement as it now stands.\n` : ""}
Write ONE short paragraph (3 to 5 sentences) that DEFINES the engagement, in the confident voice of a strategist confirming the brief. It MUST do all of these:

1) ANCHOR ON A SPECIFIC from the material, the single most revealing detail (a number, a stated goal, an exact phrase, a telling aside) and build the definition around it. Point at it plainly ("Recall is up 40% while consideration is flat", "The board signs off in six weeks"). It must be unmistakably about THIS engagement.

2) LEAD WITH THE VERDICT, NOT DESCRIPTION. The FIRST sentence states what this engagement is really about. If it merely restates their situation, delete it and start with the verdict.

3) TAKE A POSITION, reframe the brief where the material warrants it. Name what it mis-frames: "This isn't fundamentally a [X] problem, it's a [Y] one", "the brief optimises the wrong thing". Then name the real problem we are solving. (Reframe the brief's FRAMING, never the settled lens above.)

4) POINT THE WORK FORWARD, don't stop at diagnosis. Close on what this engagement sets out to settle, the sharper question the work will answer, or what we resolve first. Stated as ours, where we're headed.

THE TEST (apply it before you answer): would this exact paragraph still make sense if pasted onto a DIFFERENT brand's brief? If yes, it is too generic, rewrite it until it could ONLY have been written about this one.

BANNED as lazy filler (using these unqualified = failure): "authentic engagement", "emotional connection", "deeper connection", "meaningful engagement", "cultural resonance", "resonate with", "tap into", "leverage", "in today's landscape". ALSO BANNED, do NOT narrate your own reasoning or ask for sign-off: no "my read", "my instinct", "I think", "if I were advising you", "have I got the shape of it", "here's how I see it", and NO closing question. You are confirming the engagement, not explaining yourself.

VOICE: confident, concise, human, and JOINT, this is the engagement WE are solving. Reach for "what we're solving", "the work", "this engagement" over "I". No hedging ("it seems", "perhaps"), no throat-clearing, no bullet points. PUNCTUATION: use commas; NEVER use em-dashes or any long dash; always a comma instead. Connect it to what is commercially at stake. End on the problem we're taking on or where the work points, never on a question.

Worked example of the RIGHT altitude, tone and shape (a different brand, model the STYLE, never the content):
"This isn't the sponsorship-ROI exercise the brief describes. Recall is up 40% while consideration sits flat, so fans clock the logo and feel nothing, the deal has bought presence in a rivalry the brand has never earned a side in. So the real problem isn't wasted media, it's permission, another season of neutral visibility quietly trains fans to tune it out. What this engagement solves is credibility, whether the brand can earn the standing that visibility alone never buys, and that is where the work points."

CONFIDENCE, calibrate honestly, and don't over-hedge:
- "high": the material (plus the lens) has enough to take a clear position. Take the position; ask NOTHING.
- "medium": you can form a view but ONE genuinely essential thing is missing.
- "low": thin material, you can only partly read it.
If medium/low, ask 1 to 3 questions that TEACH, questions that CHALLENGE an assumption, not neutral either/ors. Each must name the strategic fork it decides and why it matters, then ask which side. E.g. NOT "Is this about existing fans or new fans?" but "One thing that changes the whole strategy is whether success means deepening relationships you already have or winning ones you don't, which matters more here?" The question itself should show the client something.

ENGAGEMENT NAME: a strong, real title for the work, consistent with the lens (e.g. "Adidas, European Cultural Relevance"), never "Untitled".

Return ONLY valid JSON:
{ "confidence": "high|medium|low", "engagement_name": "...", "reframe": "your first read, 3 to 5 sentences", "clarifying_questions": ["..."] }`;
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export async function analyseReframe(input: ReframeInput): Promise<Reframe> {
  if (!input.text?.trim() || input.text.trim().length < 12) {
    throw new IntelligenceError(422, "Tell me a little more about the challenge and I'll come back with my read.");
  }

  const raw = await completeJSON<Record<string, unknown>>({
    prompt: buildPrompt(input.text, input.context, input.correction), model: MODEL, maxTokens: 900, temperature: 0.5,
  });

  const conf = clean(raw.confidence).toLowerCase();
  const confidence: ReframeConfidence = conf === "high" || conf === "medium" || conf === "low" ? (conf as ReframeConfidence) : "medium";
  const questions = (Array.isArray(raw.clarifying_questions) ? raw.clarifying_questions : []).map(clean).filter(Boolean).slice(0, 3);

  return {
    confidence,
    engagement_name: stripEmDash(clean(raw.engagement_name)) || input.context.organisation || "New engagement",
    reframe: stripEmDash(clean(raw.reframe)),
    clarifying_questions: (confidence === "high" ? [] : questions).map(stripEmDash),
    generated_at: new Date().toISOString(),
    model: MODEL,
  };
}
