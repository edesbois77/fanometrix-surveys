// ── Research Reasoner run, through the job framework (gated integration) ─────
// One job = one reasoning execution over ONE authoritative Survey Studio analysis run.
// It re-reads that run's IMMUTABLE evidence snapshot (never live results) via the source
// adapter, runs the reasoning stack (build package → o3 → VERIFY → shape), and UPSERTs a
// SEPARATE research-intelligence artefact keyed on the EVIDENCE FINGERPRINT (not the run
// id) so identical governed evidence is reasoned exactly once. It writes NO authoritative
// table and produces NO user-facing output directly — the gated read path surfaces the
// verified product. Heavy deps (reasoning stack + OpenAI) are lazy-imported so registering
// this handler never loads them, and failure NEVER affects the authoritative analysis
// (which has already completed).
import { supabaseAdmin } from "@/lib/supabase-admin";
import { registerHandler } from "@/lib/jobs/registry";
import { PermanentJobError, type JobContext } from "@/lib/jobs/types";
import { RESEARCH_REASONER_JOB } from "@/lib/jobs/handlers/research-reasoner.constants";
import { researchSourceFor, type ResearchSourceKind } from "@/lib/research-intelligence/source";
import {
  RESEARCH_INTELLIGENCE_TABLE, RESEARCH_INTELLIGENCE_IDENTITY, currentMethodologyIdentity,
} from "@/lib/research-intelligence/persistence";

function str(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  if (typeof v !== "string" || !v) throw new PermanentJobError(`${RESEARCH_REASONER_JOB} job is missing string '${key}'`);
  return v;
}

async function run(ctx: JobContext): Promise<void> {
  const analysisRunId = str(ctx.payload, "analysis_run_id");
  const sourceKind = str(ctx.payload, "source_kind") as ResearchSourceKind;

  // Resolve the AUTHORITATIVE evidence from trusted stored records (never the payload) via
  // the source adapter — this fixes source/tenant identity, the immutable snapshot, and
  // the evidence fingerprint. Only wired source kinds resolve; others fail permanently.
  const source = researchSourceFor(sourceKind, /* sourceId resolved from the run */ "");
  if (!source) throw new PermanentJobError(`Unknown or unwired source_kind '${sourceKind}'`);
  const authoritative = await source.resolveRun(analysisRunId);
  if (!authoritative) throw new PermanentJobError(`Authoritative ${sourceKind} run ${analysisRunId} not found or has no usable evidence`);
  const { sourceId, evidenceFingerprint, snapshot } = authoritative;
  const identity = currentMethodologyIdentity(sourceKind, sourceId, evidenceFingerprint);

  // Lazy-load the reasoning stack (+ OpenAI caller) only when a job actually runs.
  const { generateResearchIntelligence } = await import("@/lib/research-intelligence/service");
  const { makeDefaultReasonerCaller } = await import("@/lib/research-intelligence/model");

  // COST IDEMPOTENCY: reason ONCE per FINGERPRINT identity (source + evidence fingerprint +
  // prompt/schema version + model). If a completed artefact already exists for this exact
  // identity, skip the (expensive) model call entirely — a re-enqueue, a retry after a
  // previous success, OR A NEW ANALYSIS RUN THAT PRODUCED THE SAME EVIDENCE must not re-run
  // o3. A genuine evidence change is a new fingerprint, and a version/model bump changes the
  // identity, so a genuinely new state still regenerates.
  const { data: existing } = await supabaseAdmin
    .from(RESEARCH_INTELLIGENCE_TABLE).select("status")
    .eq("source_kind", identity.source_kind).eq("source_id", identity.source_id)
    .eq("evidence_fingerprint", identity.evidence_fingerprint)
    .eq("prompt_version", identity.prompt_version).eq("schema_version", identity.schema_version)
    .eq("model", identity.model).maybeSingle();
  if ((existing as { status?: string } | null)?.status === "completed") {
    ctx.log(`Research intelligence already present for ${sourceKind} ${sourceId} (fingerprint ${evidenceFingerprint.slice(0, 8)} + methodology match) — skipping model call.`);
    return;
  }

  // Deterministic product context for the package ("what our system currently surfaces").
  // Survey-shaped for now; a future source can supply its own context or none.
  let coreFindings: { basis: string; takeaway?: string; title: string; statistic?: string }[] = [];
  if (sourceKind === "survey") {
    try {
      const { getSurveyCoreIntelligence } = await import("@/lib/studio/core-intelligence");
      const { composeSurveyResults } = await import("@/lib/studio/survey-results-compose");
      const core = await getSurveyCoreIntelligence(sourceId, true);
      const vm = composeSurveyResults({ core, analysis: null });
      if (vm.mode === "intelligence") coreFindings = [...vm.keyFindings, ...vm.worthNoting].map((f) => ({ basis: f.basis, takeaway: f.takeaway, title: f.title, statistic: f.statistic }));
    } catch { /* context only — proceed without it */ }
  }

  await ctx.heartbeat(); // renew the lease before the slow model call
  let artefact;
  try {
    artefact = await generateResearchIntelligence({ snapshot, coreFindings, caller: makeDefaultReasonerCaller() });
  } catch (e) {
    // 4xx-class (bad request / unparseable / no evidence) is permanent: record a failed
    // artefact keyed on the fingerprint identity and stop retrying. Everything else
    // (429/5xx/timeout) is transient → rethrow so the framework retries with backoff; no
    // completed row is written until it succeeds.
    const status = (e as { status?: number }).status;
    if (status && status >= 400 && status < 500 && status !== 429) {
      await supabaseAdmin.from(RESEARCH_INTELLIGENCE_TABLE).upsert({
        ...identity, analysis_run_id: analysisRunId,
        status: "failed", displayable: false,
        error: (e as Error).message?.slice(0, 300) ?? "reasoning failed", completed_at: new Date().toISOString(),
      }, { onConflict: RESEARCH_INTELLIGENCE_IDENTITY });
      throw new PermanentJobError((e as Error).message ?? "reasoning permanently failed");
    }
    throw e; // transient → retry
  }

  // Persist keyed on the fingerprint identity. analysis_run_id is written as PROVENANCE
  // (which run last confirmed this evidence). `versions` keeps the full methodology record
  // for audit; the plain prompt/schema/model columns are the identity the unique index and
  // onConflict target. Concurrency: a second run producing the SAME fingerprint conflicts
  // on the identity index and updates in place — at most one artefact row per fingerprint.
  const { error: writeErr } = await supabaseAdmin.from(RESEARCH_INTELLIGENCE_TABLE).upsert({
    ...identity, analysis_run_id: analysisRunId,
    versions: artefact.versions,
    displayable: artefact.displayable, status: "completed",
    product: artefact.product, verification: artefact.audit.verification,
    usage: artefact.usage, latency_ms: artefact.latencyMs,
    error: null, completed_at: new Date().toISOString(),
  }, { onConflict: RESEARCH_INTELLIGENCE_IDENTITY });
  if (writeErr) throw new Error(`research intelligence persist failed: ${writeErr.message}`); // transient → retried
  ctx.log(`Research intelligence for ${sourceKind} ${sourceId} (auth run ${analysisRunId}, fingerprint ${evidenceFingerprint.slice(0, 8)}): ${artefact.displayable ? "displayable" : "not-displayable"}, ${artefact.audit.verification.counts.reject} rejected claim(s).`);
}

registerHandler(RESEARCH_REASONER_JOB, { run });
