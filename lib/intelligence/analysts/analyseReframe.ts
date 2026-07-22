// The Reframe — the single most important moment in the platform (Slice 2 of the
// commissioning journey, docs/commissioning-journey.md). A senior strategist has
// read the client's material, thought about it, and comes back with a POINT OF
// VIEW — not a summary, not extracted fields.
//
// Three non-negotiables, enforced in the prompt: judgement before description;
// specificity (it must reference something unique from the material — if it could
// apply to another brand, it has failed); and a position (willing to disagree with
// the brief). Deliberately a DEDICATED analyst: the reframe prompt is only about
// judgement, never diluted by field extraction (that lives in
// analyseBriefUnderstanding). Optimise for insight, not extraction.
import { completeJSON } from "@/lib/intelligence/openai";
import { IntelligenceError } from "@/lib/intelligence/types";
import { stripEmDash } from "@/lib/strip-em-dash";

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

export type ReframeInput = { text: string; correction?: string | null };

function buildPrompt(text: string, correction?: string | null): string {
  const corrected = correction?.trim();
  return `You are a senior strategy consultant at Fanometrix (sport, fan and brand). A client has handed you the material below. You have read it, thought hard about it, and you are giving them your FIRST READ — the thing that decides whether they trust you to continue. Get this wrong and they leave. Get it right and they think "they understood my problem better than I did."

THE MATERIAL:
"""
${text.slice(0, 12000)}
"""
${corrected ? `\nTHE CLIENT HAS JUST PUSHED BACK / ADDED CONTEXT: "${corrected}"\nThis changes things. OPEN by briefly acknowledging what you now see differently — a genuine "You're right —" or "Ah, so it's really…" — then give your REVISED read incorporating it. Do not restate your old read; show that you listened and thought again. Adapting well here matters more than being right first time.\n` : ""}

Write your read as ONE short paragraph (3–5 sentences), first person, spoken like a sharp senior strategist across the table. It MUST do all three of these or it has failed:

1) ANCHOR ON A SPECIFIC. Find the single most revealing detail in the material — ideally a number, a stated goal, or an exact phrase they used — and build your read AROUND it. Quote it or point right at it. ("The number that jumps out is…", "You said…"). The read must be unmistakably about THIS material.

2) LEAD WITH JUDGEMENT, NOT DESCRIPTION. Your FIRST sentence must be your verdict — what you think is really going on. If your first sentence restates their situation, delete it and start with the verdict.

3) TAKE A POSITION — be willing to disagree with the brief. Name what it's mis-framing or optimising wrongly, where the material supports it. Use the strong move: "I don't think this is fundamentally a [X] question — it's a [Y] one", "the brief is optimising the wrong thing", "the real risk isn't where the brief says it is". Then say what the real question/risk is.

4) BEGIN ADVISING — don't stop at diagnosis. Take a step toward advice: what you'd do first, what you'd want resolved before committing to any research, or the sharper question you'd actually set out to answer. Lines like "If I were advising you today, I'd…" or "Before we commission anything, I'd want to resolve…" land well. You are a consultant already working alongside them, not just diagnosing.

THE TEST (apply it before you answer): would this exact paragraph still make sense if pasted onto a DIFFERENT brand's brief? If yes, it is too generic — rewrite it until it could ONLY have been written about this one.

BANNED as lazy filler (using these unqualified = failure): "authentic engagement", "emotional connection", "deeper connection", "meaningful engagement", "cultural resonance", "resonate with", "tap into", "leverage", "in today's landscape". If you reach for one, replace it with the concrete, specific thing you actually mean.

VOICE: confident, concise, human. No hedging ("it's worth noting", "it seems", "perhaps"), no throat-clearing, no bullet points. PUNCTUATION: use commas; NEVER use em-dashes or any long dash; always a comma instead. Connect it to what's commercially at stake. End with a short, genuine invitation to react (e.g. "That's my read — have I got the shape of it?"). You are offering a hypothesis to be pushed back on, not a verdict. Ground everything in the material; invent nothing.

Worked example of the RIGHT altitude and shape (a different brand — model the STYLE, never the content):
"You've framed this as maximising ROI on the shirt deal, but the line that stops me is recall up 40% while consideration is flat. That's not an activation problem, it's a permission problem: fans clock the logo and feel nothing, because you've bought presence in a rivalry you've never earned a side in. I'd argue the real risk isn't wasted media, it's that another season of neutral visibility quietly trains fans to tune you out. My instinct is this is a credibility question wearing a sponsorship-ROI brief's clothes. That's my read, have I got the shape of it?"

CONFIDENCE — calibrate honestly, and don't over-hedge:
- "high": the material has enough to take a clear position (e.g. a stated objective + some evidence or a named audience/market). Take the position; ask NOTHING.
- "medium": you can form a view but ONE genuinely essential thing is missing.
- "low": thin material (a line or two) — you can only partly read it.
A rich brief with tracking data, an objective and named markets is HIGH confidence — commit. Only drop to medium/low when something essential is truly absent. If medium/low, ask 1–3 questions that TEACH — questions that CHALLENGE an assumption, not neutral either/ors. Each must name the strategic fork it decides and why it matters, then ask which side. E.g. NOT "Is this about existing fans or new fans?" but "One thing that changes the whole strategy is whether success means deepening relationships you already have or winning ones you don't — which matters more here?" The question itself should show the client something.

ENGAGEMENT NAME: a strong, real title for the work (e.g. "Adidas — World Cup 2026 Cultural Relevance"), never "Untitled".

Return ONLY valid JSON:
{ "confidence": "high|medium|low", "engagement_name": "...", "reframe": "your first read, 3-5 sentences", "clarifying_questions": ["..."] }`;
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export async function analyseReframe(input: ReframeInput): Promise<Reframe> {
  if (!input.text?.trim() || input.text.trim().length < 12) {
    throw new IntelligenceError(422, "Tell me a little more about the challenge and I'll come back with my read.");
  }

  const raw = await completeJSON<Record<string, unknown>>({
    prompt: buildPrompt(input.text, input.correction), model: MODEL, maxTokens: 900, temperature: 0.5,
  });

  const conf = clean(raw.confidence).toLowerCase();
  const confidence: ReframeConfidence = conf === "high" || conf === "medium" || conf === "low" ? (conf as ReframeConfidence) : "medium";
  const questions = (Array.isArray(raw.clarifying_questions) ? raw.clarifying_questions : []).map(clean).filter(Boolean).slice(0, 3);

  return {
    confidence,
    engagement_name: stripEmDash(clean(raw.engagement_name)) || "New engagement",
    reframe: stripEmDash(clean(raw.reframe)),
    clarifying_questions: (confidence === "high" ? [] : questions).map(stripEmDash),
    generated_at: new Date().toISOString(),
    model: MODEL,
  };
}
