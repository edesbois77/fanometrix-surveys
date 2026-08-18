// ── Survey Studio — Study Objective (pure helpers) ───────────────────────────
// A Study Objective is plain research intent ("what this study is trying to learn or
// establish"). This module validates objective text and builds the AI DRAFTING prompt
// (drafting assistance only — the analyst always approves before anything is saved).
// Pure: no DB, no network.

const OBJECTIVE_MAX = 600;
const INTENT_MAX = 1500;
const norm = (s: unknown) => (typeof s === "string" ? s.trim() : "");

export function validateObjective(text: unknown): { ok: boolean; objective: string; error?: string } {
  const objective = norm(text);
  if (!objective) return { ok: false, objective, error: "An objective is required." };
  if (objective.length > OBJECTIVE_MAX) return { ok: false, objective, error: `Objective too long (${objective.length}>${OBJECTIVE_MAX}).` };
  return { ok: true, objective };
}

/** Sanitise the free-text intent a user types before it reaches the model. */
export function normaliseIntent(text: unknown): string {
  return norm(text).slice(0, INTENT_MAX);
}

export const OBJECTIVE_DRAFT_PROMPT_VERSION = "study-objective-v1";

/**
 * Build the objective-drafting prompt. Turns a user's informal commercial intent into
 * ONE concise, defensible research objective. Given governed question context (the
 * study's question texts — never raw responses), the objective stays grounded in what
 * the surveys actually ask. `avoid` lets "Try another" steer away from a prior draft.
 */
export function buildObjectiveDraftPrompt(input: { intent: string; studyName?: string | null; questions?: string[]; avoid?: string | null }): string {
  const questions = (input.questions ?? []).filter(Boolean).slice(0, 25);
  return `You help a Fanometrix user turn informal research intent into ONE concise, defensible research objective for a survey study. A good objective states what the study is trying to LEARN or ESTABLISH — it can name a proposition to assess, and should invite both supporting and limiting evidence rather than assuming a conclusion. Keep it to 1–2 sentences, neutral and research-grade. Do not promise findings, do not assume the answer, do not invent survey topics that are not implied by the intent or questions.

STUDY NAME: ${input.studyName?.trim() || "(unnamed)"}
${questions.length ? `THE STUDY'S SURVEY QUESTIONS (for grounding — do not quote verbatim):\n${questions.map((q) => `- ${q}`).join("\n")}` : ""}

USER'S INTENT (informal):
${input.intent}
${input.avoid ? `\nThe user did not like this earlier draft; produce a materially different one:\n"${input.avoid}"` : ""}

Return ONLY valid JSON: {"objective":"the suggested research objective"}. No prose outside the JSON.`;
}
