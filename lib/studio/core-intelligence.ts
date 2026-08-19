// ── Survey Studio — Analytical Core product read (Stage 6) ───────────────────
// The controlled read path that surfaces Core-derived intelligence in the product.
// It is FLAG-GATED (ANALYTICAL_CORE_PRODUCT_READ_ENABLED, default OFF), ADDITIVE
// (existing authoritative Studio analysis is untouched and remains the fallback),
// and DETERMINISTIC + FAILURE-ISOLATED: it re-analyses the survey's IMMUTABLE
// evidence_snapshot with NO model proposer, so the same governed evidence always
// yields the same product findings, and any Core error yields null (the product then
// simply shows no Core section — never a broken report).
//
// It runs the SAME governed pipeline Stage 5D established (studioEvidenceToGovernedInput
// → studioToDiscoveryInput → runAnalysis) and projects the result to the product
// contract. The Core is LAZY-imported so it never loads unless the flag is on and a
// run exists — preserving the isolation the shadow stage relied on.
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CoreFindingsProjection } from "@/lib/core/studio/projection";

/** Product read is OFF unless ANALYTICAL_CORE_PRODUCT_READ_ENABLED is "true"/"1".
 *  DISTINCT from the shadow-execution flag and from any future authority flag: Core
 *  findings are only READ into the product here — never made authoritative. */
export function coreProductReadEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.ANALYTICAL_CORE_PRODUCT_READ_ENABLED;
  return v === "true" || v === "1";
}

/** Stage 8 controlled rollout: WHO may see the Core product intelligence. Internal
 *  ADMINS always may (so the Stage-7 experience is validated in the real product);
 *  everyone else is gated by the global flag, which stays independently reversible.
 *  This is exposure control only — never analytical authority. */
export function coreReadVisibleFor(session: { role: string }, env: Record<string, string | undefined> = process.env): boolean {
  return session.role === "admin" || coreProductReadEnabled(env);
}

/** Compute Core product findings for a survey from its latest completed authoritative
 *  run's immutable evidence_snapshot. `enabled` is the caller's exposure decision
 *  (see coreReadVisibleFor). Returns null (⇒ product falls back) when not enabled, no
 *  completed run exists, the snapshot has no evidence, or anything throws. NEVER
 *  throws. Deterministic (no model). */
export async function getSurveyCoreIntelligence(
  surveyId: string,
  enabled: boolean,
): Promise<CoreFindingsProjection | null> {
  if (!enabled) return null;
  try {
    const { data: run } = await supabaseAdmin
      .from("survey_analysis_runs")
      .select("id, evidence_snapshot")
      .eq("survey_id", surveyId).eq("status", "completed")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const snapshot = (run as { evidence_snapshot?: { study?: unknown; evidence?: unknown[] } } | null)?.evidence_snapshot ?? null;
    if (!snapshot || !Array.isArray(snapshot.evidence) || snapshot.evidence.length === 0) return null;

    const { studioEvidenceToGovernedInput } = await import("@/lib/core/studio/studio-evidence-adapter");
    const { studioToDiscoveryInput } = await import("@/lib/core/studio/adapter");
    const { runAnalysis } = await import("@/lib/core/pipeline/analyse");
    const { projectAnalysis } = await import("@/lib/core/studio/projection");
    const { projectSnapshotFacts } = await import("@/lib/studio/snapshot-facts");

    const governed = studioEvidenceToGovernedInput(snapshot as never, { kind: "survey", id: surveyId });
    const result = runAnalysis(studioToDiscoveryInput(governed)); // NO model proposer → deterministic
    const projection = projectAnalysis(result);

    // Coverage: also surface the GOVERNED deterministic facts the immutable snapshot
    // already carries (leader ranks + segment observations) as OBSERVED findings —
    // never as authority. Drop the generic "divided" distribution finding for a
    // question that now has a richer leader fact (presentation dedup; evidence intact).
    const snap = projectSnapshotFacts(snapshot as never);
    const isDivided = (f: { title: string }) => /is divided|no single answer stands out/i.test(f.title);
    const deduped = projection.findings.filter((f) => !(isDivided(f) && f.question != null && snap.leaderQuestions.has(f.question)));
    const merged = [...deduped, ...snap.findings];
    if (!merged.length) return null;
    return {
      ...projection,
      findings: merged,
      counts: {
        key: merged.filter((f) => f.tier === "key").length,
        supporting: merged.filter((f) => f.tier === "supporting").length,
        context: merged.filter((f) => f.tier === "context").length,
      },
    };
  } catch {
    return null; // failure-isolated — product keeps its existing analysis/findings
  }
}
