// ── Research Reasoner — gated product read (server-only) ─────────────────────
// Reads the persisted, VERIFIED research intelligence for a survey. Like the Core
// product read it is FLAG-GATED (RESEARCH_REASONER_ENABLED, default OFF), ADDITIVE
// (deterministic Findings is untouched and remains the fallback), and FAILURE-ISOLATED
// (any problem → null → product falls back). It performs NO model call and NO generation
// — opening Findings only ever READS an existing row, so it can never trigger o3.
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ProductIntelligence } from "@/lib/research-intelligence/product";
import { surveyResearchSource, studyResearchSource, type ResearchSource } from "@/lib/research-intelligence/source";
import {
  RESEARCH_INTELLIGENCE_TABLE, currentMethodologyIdentity,
} from "@/lib/research-intelligence/persistence";

/** DISPLAY gate. Research Intelligence is SHOWN to non-admins only when
 *  RESEARCH_REASONER_ENABLED is "true"/"1". This is EXPOSURE, not generation, and is a
 *  DISTINCT gate from the Core read/shadow flags — a different capability, cost and risk
 *  surface — so it is never silently equated with them. See
 *  `researchIntelligenceGenerationEnabled` for the SEPARATE generation concern. */
export function researchReasonerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.RESEARCH_REASONER_ENABLED;
  return v === "true" || v === "1";
}

/** GENERATION gate — deliberately SEPARATE from display. Research Intelligence is GENERATED
 *  automatically for every eligible completed authoritative analysis, independent of whether
 *  anyone can currently SEE it: we must never fail to GENERATE intelligence merely because a
 *  user (or the global display flag) cannot currently expose it. Generation is therefore ON
 *  by DEFAULT, so fresh research follows the standard lifecycle with no manual step. It can
 *  be switched OFF as a pure COST kill-switch via RESEARCH_INTELLIGENCE_GENERATION_ENABLED
 *  = "false"/"0". It does NOT read RESEARCH_REASONER_ENABLED or per-user visibility. (Cost is
 *  bounded: the fingerprint identity means one genuinely-new evidence state is reasoned at
 *  most once; a re-run over unchanged evidence never re-calls the model.) */
export function researchIntelligenceGenerationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.RESEARCH_INTELLIGENCE_GENERATION_ENABLED;
  return v !== "false" && v !== "0"; // default ON; explicit off = kill-switch
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

/** The verified, displayable research intelligence for a research source's CURRENT
 *  authoritative evidence, or null. `enabled` is the caller's exposure decision
 *  (researchReasonerVisibleFor). Keyed on the EVIDENCE FINGERPRINT, not the run id:
 *  it reads the artefact for whatever fingerprint the current analysis carries, so
 *  re-running analysis over unchanged evidence (new run id, same fingerprint) keeps
 *  showing the existing intelligence with NO fallback flicker; genuinely changed evidence
 *  (new fingerprint) or a methodology version/model bump falls outside the identity and
 *  reads null (fallback until regenerated). Never throws. */
export async function getResearchIntelligence(
  source: ResearchSource,
  enabled: boolean,
): Promise<ProductIntelligence | null> {
  if (!enabled) return null;
  try {
    const current = await source.resolveCurrent();
    if (!current) return null; // no completed analysis / no fingerprint yet
    const identity = currentMethodologyIdentity(source.kind, source.sourceId, current.evidenceFingerprint);

    // Read the artefact for THIS evidence fingerprint under the CURRENT methodology. The
    // version/model columns are part of the identity, so a stale-contract artefact simply
    // is not matched (fallback) rather than being shown.
    const { data: row } = await supabaseAdmin
      .from(RESEARCH_INTELLIGENCE_TABLE)
      .select("product, displayable, status")
      .eq("source_kind", identity.source_kind)
      .eq("source_id", identity.source_id)
      .eq("evidence_fingerprint", identity.evidence_fingerprint)
      .eq("prompt_version", identity.prompt_version)
      .eq("schema_version", identity.schema_version)
      .eq("model", identity.model)
      .maybeSingle();
    const r = row as { product?: ProductIntelligence | null; displayable?: boolean; status?: string } | null;
    if (!r || r.status !== "completed" || r.displayable !== true || !r.product) return null;
    return r.product;
  } catch {
    return null; // failure-isolated — product keeps its deterministic Findings
  }
}

/** The CURRENT verified artefact for a source — product PLUS the identity/provenance a
 *  consumer needs (evidence fingerprint + the analysis run whose immutable snapshot the
 *  evidence came from). Same fingerprint + current-methodology guard as getResearchIntelligence,
 *  but not exposure-gated: callers are already server-side authorised for the source (e.g.
 *  admin-only Study curation). Used by Stage C2 Report candidate derivation + acceptance so
 *  an accepted finding can freeze the exact governed evidence. Never throws. */
export async function getCurrentResearchArtefact(
  source: ResearchSource,
): Promise<{ evidenceFingerprint: string; analysisRunId: string | null; product: ProductIntelligence } | null> {
  try {
    const current = await source.resolveCurrent();
    if (!current) return null;
    const identity = currentMethodologyIdentity(source.kind, source.sourceId, current.evidenceFingerprint);
    const { data: row } = await supabaseAdmin
      .from(RESEARCH_INTELLIGENCE_TABLE)
      .select("product, displayable, status, analysis_run_id")
      .eq("source_kind", identity.source_kind).eq("source_id", identity.source_id)
      .eq("evidence_fingerprint", identity.evidence_fingerprint)
      .eq("prompt_version", identity.prompt_version).eq("schema_version", identity.schema_version)
      .eq("model", identity.model).maybeSingle();
    const r = row as { product?: ProductIntelligence | null; displayable?: boolean; status?: string; analysis_run_id?: string | null } | null;
    if (!r || r.status !== "completed" || r.displayable !== true || !r.product) return null;
    return { evidenceFingerprint: current.evidenceFingerprint, analysisRunId: r.analysis_run_id ?? null, product: r.product };
  } catch {
    return null;
  }
}

/** Survey convenience wrapper — unchanged call-site contract for the Findings read. */
export function getSurveyResearchIntelligence(
  surveyId: string,
  enabled: boolean,
): Promise<ProductIntelligence | null> {
  return getResearchIntelligence(surveyResearchSource(surveyId), enabled);
}

/** Study convenience wrapper (Stage C1) — the SAME source-agnostic read over the study
 *  adapter. `enabled` is the caller's exposure decision; Study access itself is already
 *  gated upstream (admin-only Study curation), so a caller who cannot reach the Study never
 *  reaches this. Fingerprint-keyed, version-guarded, fail-closed — identical semantics to
 *  the survey read. */
export function getStudyResearchIntelligence(
  studyId: string,
  enabled: boolean,
): Promise<ProductIntelligence | null> {
  return getResearchIntelligence(studyResearchSource(studyId), enabled);
}
