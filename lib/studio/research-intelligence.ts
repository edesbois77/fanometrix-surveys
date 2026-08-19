// ── Research Reasoner — gated product read (server-only) ─────────────────────
// Reads the persisted, VERIFIED research intelligence for a survey. Like the Core
// product read it is FLAG-GATED (RESEARCH_REASONER_ENABLED, default OFF), ADDITIVE
// (deterministic Findings is untouched and remains the fallback), and FAILURE-ISOLATED
// (any problem → null → product falls back). It performs NO model call and NO generation
// — opening Findings only ever READS an existing row, so it can never trigger o3.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { REASONER_PROMPT_VERSION, REASONER_SCHEMA_VERSION } from "@/lib/studio/reasoning/model";
import type { ProductIntelligence } from "@/lib/studio/reasoning/product";

/** Research Reasoning is OFF unless RESEARCH_REASONER_ENABLED is "true"/"1". This is a
 *  DISTINCT gate from the Core read/shadow flags — a different capability, cost and risk
 *  surface — so it is never silently equated with them. */
export function researchReasonerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.RESEARCH_REASONER_ENABLED;
  return v === "true" || v === "1";
}

/** The server-only preview allow-list: a comma-separated set of authenticated work
 *  emails permitted to see the reasoner WHILE the global flag stays OFF (a narrow,
 *  named internal preview — not a role and not a general rollout). Parsed defensively:
 *  each entry is trimmed and lower-cased; blanks are dropped; unset/empty → an EMPTY set
 *  (fail closed). Server-side only — the raw value is never returned to any client. */
export function researchReasonerPreviewEmails(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set((env.RESEARCH_REASONER_PREVIEW_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

/** WHO may see research intelligence, in priority order: (1) an organisation-context
 *  admin (always); (2) everyone, only when the global RESEARCH_REASONER_ENABLED flag is
 *  on; (3) a named preview user whose AUTHENTICATED work email is in the allow-list, even
 *  with the flag OFF. Exposure control only — never authority. The email compared is the
 *  server-side authenticated `session.workEmail` (from requireUser), never a client-
 *  supplied value; matching is trimmed + case-insensitive and FAILS CLOSED (no email, or
 *  no/empty allow-list ⇒ no preview access). */
export function researchReasonerVisibleFor(
  session: { role: string; workEmail?: string | null },
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (session.role === "admin") return true;
  if (researchReasonerEnabled(env)) return true;
  const email = (session.workEmail ?? "").trim().toLowerCase();
  if (!email) return false; // fail closed: no authenticated email → no preview
  return researchReasonerPreviewEmails(env).has(email);
}

/** The verified, displayable research intelligence for a survey's CURRENT analysis, or
 *  null. `enabled` is the caller's exposure decision (researchReasonerVisibleFor). Reads
 *  ONLY the row tied to the latest completed analysis run, so intelligence generated from
 *  an older evidence snapshot is never shown; a version bump also invalidates (fallback
 *  until regenerated). Never throws. */
export async function getSurveyResearchIntelligence(
  surveyId: string,
  enabled: boolean,
): Promise<ProductIntelligence | null> {
  if (!enabled) return null;
  try {
    // The current authoritative analysis = the latest completed survey run.
    const { data: run } = await supabaseAdmin
      .from("survey_analysis_runs")
      .select("id")
      .eq("survey_id", surveyId).eq("status", "completed")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const analysisRunId = (run as { id?: string } | null)?.id;
    if (!analysisRunId) return null;

    const { data: row } = await supabaseAdmin
      .from("research_reasoner_runs")
      .select("product, displayable, status, versions")
      .eq("analysis_run_id", analysisRunId).maybeSingle();
    const r = row as { product?: ProductIntelligence | null; displayable?: boolean; status?: string; versions?: { prompt?: string; schema?: string } } | null;
    if (!r || r.status !== "completed" || r.displayable !== true || !r.product) return null;
    // Version guard: a prompt/schema bump makes a stored artefact stale → fall back until
    // it is regenerated, rather than showing intelligence from a superseded contract.
    if (r.versions?.prompt !== REASONER_PROMPT_VERSION || r.versions?.schema !== REASONER_SCHEMA_VERSION) return null;
    return r.product;
  } catch {
    return null; // failure-isolated — product keeps its deterministic Findings
  }
}
