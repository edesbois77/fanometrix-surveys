// ── Research Reasoner run, through the job framework (gated integration) ─────
// One job = one reasoning execution over ONE authoritative Survey Studio analysis run.
// It re-reads that run's IMMUTABLE evidence_snapshot (never live results), runs the
// reasoning stack (build package → o3 → VERIFY → shape), and UPSERTs a SEPARATE
// research_reasoner_runs artefact keyed on the run id (idempotent). It writes NO
// authoritative table and produces NO user-facing output directly — the gated read path
// surfaces the verified product. Heavy deps (reasoning stack + OpenAI) are lazy-imported
// so registering this handler never loads them, and failure NEVER affects the
// authoritative analysis (which has already completed).
import { supabaseAdmin } from "@/lib/supabase-admin";
import { registerHandler } from "@/lib/jobs/registry";
import { PermanentJobError, type JobContext } from "@/lib/jobs/types";
import { RESEARCH_REASONER_JOB } from "@/lib/jobs/handlers/research-reasoner.constants";

function str(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  if (typeof v !== "string" || !v) throw new PermanentJobError(`${RESEARCH_REASONER_JOB} job is missing string '${key}'`);
  return v;
}

async function run(ctx: JobContext): Promise<void> {
  const analysisRunId = str(ctx.payload, "analysis_run_id");
  const sourceKind = str(ctx.payload, "source_kind");
  if (sourceKind !== "survey") throw new PermanentJobError(`Unknown source_kind '${sourceKind}'`);

  // Resolve the AUTHORITATIVE run from trusted stored records (never the payload) — this
  // fixes survey/tenant identity and the immutable snapshot from the run row.
  const { data: runRow, error } = await supabaseAdmin
    .from("survey_analysis_runs").select("id, survey_id, evidence_snapshot, evidence_hash").eq("id", analysisRunId).single();
  if (error || !runRow) throw new PermanentJobError(`Authoritative survey run ${analysisRunId} not found`);
  const surveyId = (runRow as { survey_id: string }).survey_id;
  const snapshot = (runRow as { evidence_snapshot?: { evidence?: unknown[] } | null }).evidence_snapshot ?? null;
  const evidenceHash = (runRow as { evidence_hash?: string | null }).evidence_hash ?? null;
  if (!snapshot || !Array.isArray(snapshot.evidence) || snapshot.evidence.length === 0) {
    throw new PermanentJobError(`Run ${analysisRunId} has no usable evidence_snapshot`);
  }

  // Lazy-load the reasoning stack (+ OpenAI caller) only when a job actually runs.
  const { generateResearchIntelligence } = await import("@/lib/studio/reasoning/service");
  const { makeDefaultReasonerCaller, REASONER_PROMPT_VERSION, REASONER_SCHEMA_VERSION } = await import("@/lib/studio/reasoning/model");

  // COST IDEMPOTENCY (§16): reason ONCE per (analysis run + prompt/schema version +
  // evidence fingerprint). If a completed artefact already exists for this exact
  // combination, skip the (expensive) model call entirely — a re-enqueue or a retry after
  // a previous success must not re-run o3. A new analysis is a new run id, and a version /
  // snapshot change fails the match below, so a genuinely new state still regenerates.
  const { data: existing } = await supabaseAdmin
    .from("research_reasoner_runs").select("status, versions, evidence_fingerprint").eq("analysis_run_id", analysisRunId).maybeSingle();
  const ex = existing as { status?: string; versions?: { prompt?: string; schema?: string }; evidence_fingerprint?: string | null } | null;
  if (ex && ex.status === "completed" && ex.evidence_fingerprint === evidenceHash
      && ex.versions?.prompt === REASONER_PROMPT_VERSION && ex.versions?.schema === REASONER_SCHEMA_VERSION) {
    ctx.log(`Research reasoning already present for run ${analysisRunId} (versions + fingerprint match) — skipping model call.`);
    return;
  }
  // Deterministic product context for the package ("what our system currently surfaces").
  let coreFindings: { basis: string; takeaway?: string; title: string; statistic?: string }[] = [];
  try {
    const { getSurveyCoreIntelligence } = await import("@/lib/studio/core-intelligence");
    const { composeSurveyResults } = await import("@/lib/studio/survey-results-compose");
    const core = await getSurveyCoreIntelligence(surveyId, true);
    const vm = composeSurveyResults({ core, analysis: null });
    if (vm.mode === "intelligence") coreFindings = [...vm.keyFindings, ...vm.worthNoting].map((f) => ({ basis: f.basis, takeaway: f.takeaway, title: f.title, statistic: f.statistic }));
  } catch { /* context only — proceed without it */ }

  await ctx.heartbeat(); // renew the lease before the slow model call
  let artefact;
  try {
    artefact = await generateResearchIntelligence({ snapshot, coreFindings, caller: makeDefaultReasonerCaller() });
  } catch (e) {
    // 4xx-class (bad request / unparseable / no evidence) is permanent: record a failed
    // artefact and stop retrying. Everything else (429/5xx/timeout) is transient → rethrow
    // so the framework retries with backoff; no row is written until it succeeds.
    const status = (e as { status?: number }).status;
    if (status && status >= 400 && status < 500 && status !== 429) {
      await supabaseAdmin.from("research_reasoner_runs").upsert({
        source_kind: "survey", source_id: surveyId, analysis_run_id: analysisRunId,
        evidence_fingerprint: evidenceHash, status: "failed", displayable: false,
        error: (e as Error).message?.slice(0, 300) ?? "reasoning failed", completed_at: new Date().toISOString(),
      }, { onConflict: "analysis_run_id" });
      throw new PermanentJobError((e as Error).message ?? "reasoning permanently failed");
    }
    throw e; // transient → retry
  }

  const { error: writeErr } = await supabaseAdmin.from("research_reasoner_runs").upsert({
    source_kind: "survey", source_id: surveyId, analysis_run_id: analysisRunId,
    evidence_fingerprint: evidenceHash,
    versions: artefact.versions, model: artefact.model,
    displayable: artefact.displayable, status: "completed",
    product: artefact.product, verification: artefact.audit.verification,
    usage: artefact.usage, latency_ms: artefact.latencyMs,
    completed_at: new Date().toISOString(),
  }, { onConflict: "analysis_run_id" });
  if (writeErr) throw new Error(`research intelligence persist failed: ${writeErr.message}`); // transient → retried
  ctx.log(`Research reasoning for survey ${surveyId} (auth run ${analysisRunId}): ${artefact.displayable ? "displayable" : "not-displayable"}, ${artefact.audit.verification.counts.reject} rejected claim(s).`);
}

registerHandler(RESEARCH_REASONER_JOB, { run });
