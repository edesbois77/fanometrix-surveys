// ── Survey Studio — Study Objective service (server-only) ────────────────────
// AI-assisted objective DRAFTING only: turns a user's informal intent into a suggested
// research objective. It NEVER saves — the analyst approves the text, which is then
// persisted through the existing study PATCH. Reuses the one safe OpenAI primitive.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AuthedUser } from "@/lib/auth-server";
import { canCurateStudies } from "@/lib/studio/study";
import { resolveStudyResults } from "@/lib/studio/study-results-resolve";
import { completeJSON } from "@/lib/intelligence/openai";
import { buildObjectiveDraftPrompt, normaliseIntent, OBJECTIVE_DRAFT_PROMPT_VERSION } from "@/lib/studio/study-objective";

export type CompleteFn = typeof completeJSON;
export type SuggestResult = { ok: boolean; status: number; objective?: string; promptVersion?: string; error?: string };

/** Suggest ONE research objective from informal intent. Admin/operator only. No save. */
export async function suggestObjective(
  session: AuthedUser, studyId: string, intentRaw: unknown, avoid?: unknown, opts?: { complete?: CompleteFn },
): Promise<SuggestResult> {
  if (!canCurateStudies(session)) return { ok: false, status: 403, error: "Forbidden" };
  const { data: study } = await supabaseAdmin.from("studies").select("id, name").eq("id", studyId).single();
  if (!study) return { ok: false, status: 404, error: "Study not found" };

  const intent = normaliseIntent(intentRaw);
  if (!intent) return { ok: false, status: 400, error: "Describe, in your own words, what this study should learn or establish." };

  // Ground the draft in the study's governed question texts (labels only — never raw data).
  const { results } = await resolveStudyResults(session, studyId);
  const questions = results ? results.resultGroups.map((g) => g.label).filter(Boolean) : [];

  try {
    const complete = opts?.complete ?? completeJSON;
    const raw = await complete<{ objective?: string }>({
      prompt: buildObjectiveDraftPrompt({ intent, studyName: study.name as string, questions, avoid: typeof avoid === "string" ? avoid : null }),
      model: "gpt-4o", temperature: 0.5, maxTokens: 300,
    });
    const objective = typeof raw?.objective === "string" ? raw.objective.trim() : "";
    if (!objective) return { ok: false, status: 502, error: "Could not draft an objective. Try again." };
    return { ok: true, status: 200, objective, promptVersion: OBJECTIVE_DRAFT_PROMPT_VERSION };
  } catch {
    return { ok: false, status: 502, error: "Objective drafting is unavailable right now. You can still write one yourself." };
  }
}
